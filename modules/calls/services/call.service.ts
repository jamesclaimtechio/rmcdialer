import { PrismaClient, Prisma } from '@prisma/client';
import {
  CallSession,
  CallSessionOptions,
  CallUpdateOptions,
  CallOutcomeOptions,
  CallOutcome,
  CallSessionWithContext,
  UserCallContext,
  GetCallHistoryOptions,
  CallHistoryResult,
  CallAnalytics,
  CallAnalyticsFilters,
  Callback,
  CreateCallbackRequest,
  GetCallbacksOptions,
  CallbacksResult,
  TwilioWebhookData,
  InitiateCallRequest,
  InitiateCallResponse
} from '../types/call.types';

// Dependencies that will be injected
interface CallServiceDependencies {
  prisma: PrismaClient;
  logger: {
    info: (message: string, meta?: any) => void;
    error: (message: string, error?: any) => void;
    warn: (message: string, meta?: any) => void;
  };
}

export class CallService {
  constructor(private deps: CallServiceDependencies) {}

  /**
   * Initiate a new call session
   */
  async initiateCall(options: CallSessionOptions): Promise<InitiateCallResponse> {
    const { userId, agentId, queueId, direction = 'outbound', phoneNumber } = options;

    return await this.deps.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Get user context for the call
      const userContext = await this.getUserCallContext(userId);

      // Create call session
      const callSession = await tx.callSession.create({
        data: {
          userId: BigInt(userId),
          agentId,
          callQueueId: queueId || '', // Will be set when assigned from queue
          status: 'initiated',
          direction,
          startedAt: new Date(),
          userClaimsContext: JSON.stringify(userContext.claims)
        }
      });

      // Update agent session to "on_call" if not already
      await tx.agentSession.updateMany({
        where: { agentId, status: { in: ['available', 'break'] } },
        data: { 
          status: 'on_call',
          currentCallSessionId: callSession.id,
          lastActivity: new Date()
        }
      });

      // Update queue entry status if from queue
      if (queueId) {
        await tx.callQueue.update({
          where: { id: queueId },
          data: { status: 'assigned' }
        });
      }

      this.deps.logger.info('Call session initiated', {
        callSessionId: callSession.id,
        userId,
        agentId,
        queueId,
        direction,
        phoneNumber: phoneNumber || userContext.phoneNumber
      });

      return {
        callSession: this.mapToCallSession(callSession),
        userContext
      };
    });
  }

  /**
   * Update call session status (e.g., from Twilio webhook)
   */
  async updateCallStatus(sessionId: string, updateData: CallUpdateOptions): Promise<CallSession> {
    const session = await this.deps.prisma.callSession.update({
      where: { id: sessionId },
      data: {
        status: updateData.status,
        twilioCallSid: updateData.twilioCallSid,
        connectedAt: updateData.connectedAt,
        endedAt: updateData.endedAt,
        // Calculate duration if call ended
        ...(updateData.endedAt && {
          durationSeconds: Math.floor(
            (updateData.endedAt.getTime() - new Date().getTime()) / 1000
          )
        }),
        // Calculate talk time if connected and ended
        ...(updateData.endedAt && updateData.connectedAt && {
          talkTimeSeconds: Math.floor(
            (updateData.endedAt.getTime() - updateData.connectedAt.getTime()) / 1000
          )
        })
      }
    });

    this.deps.logger.info('Call status updated', {
      sessionId,
      status: updateData.status,
      twilioCallSid: updateData.twilioCallSid
    });

    return this.mapToCallSession(session);
  }

  /**
   * Record call outcome and disposition
   */
  async recordCallOutcome(
    sessionId: string, 
    agentId: number, 
    outcome: CallOutcomeOptions
  ): Promise<CallOutcome> {
    return await this.deps.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Get the call session
      const callSession = await tx.callSession.findUnique({
        where: { id: sessionId },
        include: { callQueue: true }
      });

      if (!callSession) {
        throw new Error('Call session not found');
      }

      if (callSession.agentId !== agentId) {
        throw new Error('Agent not authorized for this call session');
      }

      // Create call outcome record
      const callOutcome = await tx.callOutcome.create({
        data: {
          callSessionId: sessionId,
          outcomeType: outcome.outcomeType,
          outcomeNotes: outcome.outcomeNotes || '',
          nextCallDelayHours: outcome.nextCallDelayHours || this.getDefaultDelayHours(outcome.outcomeType),
          scoreAdjustment: outcome.scoreAdjustment || this.getScoreAdjustment(outcome.outcomeType),
          magicLinkSent: outcome.magicLinkSent || false,
          smsSent: outcome.smsSent || false,
          documentsRequested: outcome.documentsRequested ? JSON.stringify(outcome.documentsRequested) : undefined,
          recordedByAgentId: agentId
        }
      });

      // Update user call score
      await this.updateUserScoreAfterCall(
        tx, 
        Number(callSession.userId), 
        outcome.outcomeType, 
        outcome.scoreAdjustment
      );

      // Create callback if requested
      if (outcome.outcomeType === 'callback_requested' && outcome.callbackDateTime) {
        await tx.callback.create({
          data: {
            userId: callSession.userId,
            scheduledFor: outcome.callbackDateTime,
            callbackReason: outcome.callbackReason || 'User requested callback',
            preferredAgentId: agentId,
            originalCallSessionId: sessionId,
            status: 'pending'
          }
        });
      }

      // Update agent session back to available if call ended
      if (['completed', 'failed', 'no_answer'].includes(callSession.status)) {
        await tx.agentSession.updateMany({
          where: { agentId, currentCallSessionId: sessionId },
          data: { 
            status: 'available',
            currentCallSessionId: null,
            callsCompletedToday: { increment: 1 },
            totalTalkTimeSeconds: { 
              increment: callSession.talkTimeSeconds || 0 
            },
            lastActivity: new Date()
          }
        });
      }

      // Update queue entry to completed
      if (callSession.callQueueId) {
        await tx.callQueue.update({
          where: { id: callSession.callQueueId },
          data: { status: 'completed' }
        });
      }

      this.deps.logger.info('Call outcome recorded', {
        sessionId,
        agentId,
        outcomeType: outcome.outcomeType,
        callbackRequested: outcome.outcomeType === 'callback_requested'
      });

      return this.mapToCallOutcome(callOutcome);
    });
  }

  /**
   * Get call history with filtering and pagination
   */
  async getCallHistory(options: GetCallHistoryOptions): Promise<CallHistoryResult> {
    const { page = 1, limit = 20, agentId, userId, startDate, endDate, outcome, status } = options;

    const where: any = {};
    if (agentId) where.agentId = agentId;
    if (userId) where.userId = BigInt(userId);
    if (startDate || endDate) {
      where.startedAt = {};
      if (startDate) where.startedAt.gte = startDate;
      if (endDate) where.startedAt.lte = endDate;
    }
    if (status) where.status = status;
    if (outcome) {
      where.callOutcomes = {
        some: { outcomeType: outcome }
      };
    }

    const [calls, total] = await Promise.all([
      this.deps.prisma.callSession.findMany({
        where,
        include: {
          agent: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          callOutcomes: true
        },
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      this.deps.prisma.callSession.count({ where })
    ]);

    // Get user context for each call
    const callsWithContext = await Promise.all(
      calls.map(async (call: any) => {
        const userContext = await this.getUserCallContext(Number(call.userId));
        return {
          ...this.mapToCallSession(call),
          userContext,
          agent: call.agent
        };
      })
    );

    return {
      calls: callsWithContext,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get analytics for calls
   */
  async getCallAnalytics(filters: CallAnalyticsFilters): Promise<CallAnalytics> {
    const { agentId, startDate, endDate, outcomeType } = filters;

    const where: any = {};
    if (agentId) where.agentId = agentId;
    if (startDate || endDate) {
      where.startedAt = {};
      if (startDate) where.startedAt.gte = startDate;
      if (endDate) where.startedAt.lte = endDate;
    }

    const [
      totalCalls,
      completedCalls,
      outcomeStats,
      avgDuration,
      avgTalkTime
    ] = await Promise.all([
      this.deps.prisma.callSession.count({ where }),
      this.deps.prisma.callSession.count({ 
        where: { ...where, status: 'completed' } 
      }),
      this.deps.prisma.callOutcome.groupBy({
        by: ['outcomeType'],
        _count: { id: true },
        where: {
          callSession: where
        }
      }),
      this.deps.prisma.callSession.aggregate({
        where: { ...where, durationSeconds: { not: null } },
        _avg: { durationSeconds: true }
      }),
      this.deps.prisma.callSession.aggregate({
        where: { ...where, talkTimeSeconds: { not: null } },
        _avg: { talkTimeSeconds: true }
      })
    ]);

    const outcomes: Record<string, number> = {};
    outcomeStats.forEach((stat: any) => {
      outcomes[stat.outcomeType] = stat._count.id;
    });

    return {
      totalCalls,
      completedCalls,
      successfulContacts: outcomes.contacted || 0,
      noAnswers: outcomes.no_answer || 0,
      callbacks: outcomes.callback_requested || 0,
      notInterested: outcomes.not_interested || 0,
      avgDurationMinutes: avgDuration._avg.durationSeconds ? 
        Math.round((avgDuration._avg.durationSeconds / 60) * 100) / 100 : 0,
      avgTalkTimeMinutes: avgTalkTime._avg.talkTimeSeconds ? 
        Math.round((avgTalkTime._avg.talkTimeSeconds / 60) * 100) / 100 : 0,
      contactRate: totalCalls > 0 ? 
        Math.round((outcomes.contacted || 0) / totalCalls * 100) : 0
    };
  }

  /**
   * Get callbacks with filtering and pagination
   */
  async getCallbacks(options: GetCallbacksOptions): Promise<CallbacksResult> {
    const { page = 1, limit = 20, agentId, status, scheduledFrom, scheduledTo } = options;

    const where: any = {};
    if (agentId) where.preferredAgentId = agentId;
    if (status) where.status = status;
    if (scheduledFrom || scheduledTo) {
      where.scheduledFor = {};
      if (scheduledFrom) where.scheduledFor.gte = scheduledFrom;
      if (scheduledTo) where.scheduledFor.lte = scheduledTo;
    }

    const [callbacks, total] = await Promise.all([
      this.deps.prisma.callback.findMany({
        where,
        include: {
          preferredAgent: {
            select: {
              firstName: true,
              lastName: true
            }
          }
        },
        orderBy: { scheduledFor: 'asc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      this.deps.prisma.callback.count({ where })
    ]);

    // Get user context for each callback
    const callbacksWithContext = await Promise.all(
      callbacks.map(async (callback: any) => {
        const userContext = await this.getUserCallContext(Number(callback.userId));
        return {
          ...callback,
          user: {
            firstName: userContext.firstName,
            lastName: userContext.lastName,
            phoneNumber: userContext.phoneNumber
          },
          preferredAgent: callback.preferredAgent
        };
      })
    );

    return {
      callbacks: callbacksWithContext,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Handle Twilio webhook for call status updates
   */
  async handleTwilioWebhook(webhookData: TwilioWebhookData): Promise<void> {
    const { CallSid, CallStatus, Duration, CallDuration } = webhookData;

    // Find call session by Twilio SID
    const callSession = await this.deps.prisma.callSession.findFirst({
      where: { twilioCallSid: CallSid }
    });

    if (!callSession) {
      this.deps.logger.warn('Twilio webhook for unknown call session', { CallSid });
      return;
    }

    // Map Twilio status to our status
    const statusMap: Record<string, string> = {
      'ringing': 'ringing',
      'in-progress': 'connected',
      'completed': 'completed',
      'busy': 'no_answer',
      'failed': 'failed',
      'no-answer': 'no_answer',
      'canceled': 'failed'
    };

    const updateData: CallUpdateOptions = {
      status: statusMap[CallStatus] as any || 'failed'
    };

    // Set times based on status
    if (CallStatus === 'in-progress' && !callSession.connectedAt) {
      updateData.connectedAt = new Date();
    }

    if (['completed', 'busy', 'failed', 'no-answer', 'canceled'].includes(CallStatus)) {
      updateData.endedAt = new Date();
    }

    await this.updateCallStatus(callSession.id, updateData);

    this.deps.logger.info('Twilio webhook processed', {
      callSessionId: callSession.id,
      twilioStatus: CallStatus,
      ourStatus: updateData.status
    });
  }

  /**
   * Private helper methods
   */
  private async getUserCallContext(userId: number): Promise<UserCallContext> {
    // In production, this would query the MySQL replica database
    // For now, using mock data that matches the schema
    const mockUser = this.getMockUserData(userId);
    
    return {
      userId: mockUser.id,
      firstName: mockUser.firstName,
      lastName: mockUser.lastName,
      email: mockUser.email,
      phoneNumber: mockUser.phoneNumber,
      claims: mockUser.claims || [],
      callScore: {
        currentScore: 50, // Mock score
        totalAttempts: 1,
        lastOutcome: 'no_answer'
      }
    };
  }

  private getDefaultDelayHours(outcomeType: string): number {
    const delayMap: Record<string, number> = {
      'contacted': 24,
      'no_answer': 4,
      'busy': 2,
      'wrong_number': 48,
      'not_interested': 48,
      'callback_requested': 0,
      'left_voicemail': 8,
      'failed': 1
    };
    return delayMap[outcomeType] || 4;
  }

  private getScoreAdjustment(outcomeType: string): number {
    const adjustmentMap: Record<string, number> = {
      'contacted': -10,      // Lower score = higher priority for follow-up
      'no_answer': 5,
      'busy': 2,
      'wrong_number': 50,    // Much lower priority
      'not_interested': 100, // Lowest priority
      'callback_requested': -20, // High priority
      'left_voicemail': 10,
      'failed': 0
    };
    return adjustmentMap[outcomeType] || 0;
  }

  private async updateUserScoreAfterCall(
    tx: Prisma.TransactionClient,
    userId: number,
    outcomeType: string,
    scoreAdjustment?: number
  ): Promise<void> {
    const adjustment = scoreAdjustment || this.getScoreAdjustment(outcomeType);
    const nextCallAfter = this.calculateNextCallTime(outcomeType);

    await tx.userCallScore.upsert({
      where: { userId: BigInt(userId) },
      update: {
        currentScore: { increment: adjustment },
        lastOutcome: outcomeType,
        lastCallAt: new Date(),
        totalAttempts: { increment: 1 },
        nextCallAfter,
        updatedAt: new Date()
      },
      create: {
        userId: BigInt(userId),
        currentScore: Math.max(0, adjustment),
        lastOutcome: outcomeType,
        lastCallAt: new Date(),
        totalAttempts: 1,
        nextCallAfter
      }
    });
  }

  private calculateNextCallTime(outcomeType: string): Date {
    const now = new Date();
    const delayHours = this.getDefaultDelayHours(outcomeType);
    return new Date(now.getTime() + delayHours * 60 * 60 * 1000);
  }

  private getMockUserData(userId: number) {
    const mockUsers: Record<number, any> = {
      12345: {
        id: 12345,
        firstName: 'John',
        lastName: 'Smith',
        email: 'john.smith@email.com',
        phoneNumber: '+447700123456',
        claims: [{
          id: 67890,
          type: 'VEHICLE',
          status: 'documents_needed',
          lender: 'Santander',
          value: 15000,
          requirements: [
            { id: 'req1', type: 'ID_DOCUMENT', status: 'PENDING', reason: 'Identity verification required' },
            { id: 'req2', type: 'BANK_STATEMENTS', status: 'PENDING', reason: '3 months bank statements needed' }
          ]
        }]
      },
      12346: {
        id: 12346,
        firstName: 'Sarah',
        lastName: 'Johnson',
        email: 'sarah.johnson@email.com',
        phoneNumber: '+447700234567',
        claims: [{
          id: 78901,
          type: 'CREDIT_CARD',
          status: 'documents_needed',
          lender: 'Barclaycard',
          value: 8000,
          requirements: [
            { id: 'req3', type: 'CREDIT_STATEMENTS', status: 'PENDING', reason: 'Credit card statements required' }
          ]
        }]
      }
    };

    return mockUsers[userId] || {
      id: userId,
      firstName: 'Unknown',
      lastName: 'User',
      email: `user${userId}@email.com`,
      phoneNumber: '+447700000000',
      claims: []
    };
  }

  /**
   * Mapping functions
   */
  private mapToCallSession(dbSession: any): CallSession {
    return {
      id: dbSession.id,
      userId: Number(dbSession.userId),
      agentId: dbSession.agentId,
      callQueueId: dbSession.callQueueId,
      twilioCallSid: dbSession.twilioCallSid,
      status: dbSession.status,
      direction: dbSession.direction,
      startedAt: dbSession.startedAt,
      connectedAt: dbSession.connectedAt,
      endedAt: dbSession.endedAt,
      durationSeconds: dbSession.durationSeconds,
      talkTimeSeconds: dbSession.talkTimeSeconds,
      userClaimsContext: dbSession.userClaimsContext,
      createdAt: dbSession.createdAt
    };
  }

  private mapToCallOutcome(dbOutcome: any): CallOutcome {
    return {
      id: dbOutcome.id,
      callSessionId: dbOutcome.callSessionId,
      outcomeType: dbOutcome.outcomeType,
      outcomeNotes: dbOutcome.outcomeNotes,
      nextCallDelayHours: dbOutcome.nextCallDelayHours,
      scoreAdjustment: dbOutcome.scoreAdjustment,
      magicLinkSent: dbOutcome.magicLinkSent,
      smsSent: dbOutcome.smsSent,
      documentsRequested: dbOutcome.documentsRequested ? 
        JSON.parse(dbOutcome.documentsRequested) : undefined,
      recordedByAgentId: dbOutcome.recordedByAgentId,
      createdAt: dbOutcome.createdAt
    };
  }
} 