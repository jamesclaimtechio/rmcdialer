import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '@/lib/trpc/server';
import { TRPCError } from '@trpc/server';
import {
  CallService,
  type CallSessionOptions,
  type CallUpdateOptions,
  type CallOutcomeOptions,
  type GetCallHistoryOptions,
  type CallAnalyticsFilters,
  type GetCallbacksOptions
} from '@/modules/calls';
import { prisma } from '@/lib/db';

// Create logger instance (in production this would come from a shared logger service)
const logger = {
  info: (message: string, meta?: any) => console.log(`[Calls] ${message}`, meta),
  error: (message: string, error?: any) => console.error(`[Calls ERROR] ${message}`, error),
  warn: (message: string, meta?: any) => console.warn(`[Calls WARN] ${message}`, meta)
};

// Initialize call service with dependencies
const callService = new CallService({ prisma, logger });

// Input validation schemas
const InitiateCallSchema = z.object({
  userId: z.number().positive(),
  queueId: z.string().uuid().optional(),
  phoneNumber: z.string().optional(),
  direction: z.enum(['outbound', 'inbound']).default('outbound')
});

const UpdateCallStatusSchema = z.object({
  sessionId: z.string().uuid(),
  status: z.enum(['initiated', 'connecting', 'ringing', 'connected', 'completed', 'failed', 'no_answer']).optional(),
  twilioCallSid: z.string().optional(),
  connectedAt: z.date().optional(),
  endedAt: z.date().optional(),
  failureReason: z.string().optional()
});

const RecordOutcomeSchema = z.object({
  sessionId: z.string().uuid(),
  outcomeType: z.enum([
    'contacted', 'no_answer', 'busy', 'wrong_number', 'not_interested', 
    'callback_requested', 'left_voicemail', 'failed'
  ]),
  outcomeNotes: z.string().optional(),
  nextCallDelayHours: z.number().min(0).max(168).optional(), // Max 1 week
  magicLinkSent: z.boolean().optional(),
  smsSent: z.boolean().optional(),
  documentsRequested: z.array(z.string()).optional(),
  callbackDateTime: z.date().optional(),
  callbackReason: z.string().optional(),
  scoreAdjustment: z.number().optional()
});

const CallHistoryFiltersSchema = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
  agentId: z.number().optional(),
  userId: z.number().optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  outcome: z.string().optional(),
  status: z.string().optional()
});

const CallAnalyticsFiltersSchema = z.object({
  agentId: z.number().optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  outcomeType: z.string().optional()
});

const CallbackFiltersSchema = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
  agentId: z.number().optional(),
  status: z.enum(['pending', 'completed', 'cancelled']).optional(),
  scheduledFrom: z.date().optional(),
  scheduledTo: z.date().optional()
});

const TwilioWebhookSchema = z.object({
  CallSid: z.string(),
  CallStatus: z.string(),
  Direction: z.string(),
  From: z.string(),
  To: z.string(),
  Duration: z.string().optional(),
  CallDuration: z.string().optional(),
  RecordingUrl: z.string().optional(),
  Digits: z.string().optional()
});

export const callsRouter = createTRPCRouter({
  // Initiate a new call session
  initiateCall: protectedProcedure
    .input(InitiateCallSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const callOptions: CallSessionOptions = {
          userId: input.userId,
          agentId: ctx.agent.id,
          queueId: input.queueId,
          direction: input.direction,
          phoneNumber: input.phoneNumber
        };

        const result = await callService.initiateCall(callOptions);
        return result;
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Failed to initiate call'
        });
      }
    }),

  // Update call session status (typically from Twilio webhooks)
  updateCallStatus: protectedProcedure
    .input(UpdateCallStatusSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const { sessionId, ...updateData } = input;
        const session = await callService.updateCallStatus(sessionId, updateData);
        return session;
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Failed to update call status'
        });
      }
    }),

  // Record call outcome and disposition
  recordOutcome: protectedProcedure
    .input(RecordOutcomeSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const { sessionId, ...outcomeData } = input;
        const outcome = await callService.recordCallOutcome(sessionId, ctx.agent.id, outcomeData);
        return outcome;
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Failed to record call outcome'
        });
      }
    }),

  // Get call history with filtering and pagination
  getCallHistory: protectedProcedure
    .input(CallHistoryFiltersSchema)
    .query(async ({ input, ctx }) => {
      try {
        // If not admin/supervisor, limit to agent's own calls
        const filters = { ...input };
        if (ctx.agent.role === 'agent') {
          filters.agentId = ctx.agent.id;
        }

        const history = await callService.getCallHistory(filters);
        return history;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get call history'
        });
      }
    }),

  // Get call analytics and metrics
  getAnalytics: protectedProcedure
    .input(CallAnalyticsFiltersSchema)
    .query(async ({ input, ctx }) => {
      try {
        // If not admin/supervisor, limit to agent's own analytics
        const filters = { ...input };
        if (ctx.agent.role === 'agent') {
          filters.agentId = ctx.agent.id;
        }

        const analytics = await callService.getCallAnalytics(filters);
        return analytics;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get call analytics'
        });
      }
    }),

  // Get callbacks with filtering
  getCallbacks: protectedProcedure
    .input(CallbackFiltersSchema)
    .query(async ({ input, ctx }) => {
      try {
        // If not admin/supervisor, limit to agent's preferred callbacks
        const filters = { ...input };
        if (ctx.agent.role === 'agent') {
          filters.agentId = ctx.agent.id;
        }

        const callbacks = await callService.getCallbacks(filters);
        return callbacks;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get callbacks'
        });
      }
    }),

  // Get current call session for agent (if any)
  getCurrentCall: protectedProcedure
    .query(async ({ ctx }) => {
      try {
        // Find current call session for this agent
        const currentSession = await prisma.callSession.findFirst({
          where: {
            agentId: ctx.agent.id,
            status: { in: ['initiated', 'connecting', 'ringing', 'connected'] }
          },
          orderBy: { startedAt: 'desc' }
        });

        if (!currentSession) {
          return null;
        }

        // Get user context for the current call
        const userContext = await callService['getUserCallContext'](Number(currentSession.userId));

        return {
          ...currentSession,
          userContext
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get current call'
        });
      }
    }),

  // Handle Twilio webhook (public endpoint, but we'll add auth later)
  handleTwilioWebhook: protectedProcedure // In production, this should be a public procedure with Twilio auth
    .input(TwilioWebhookSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        await callService.handleTwilioWebhook(input);
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Failed to process Twilio webhook'
        });
      }
    }),

  // Get call session by ID (for detailed view)
  getCallSession: protectedProcedure
    .input(z.object({
      sessionId: z.string().uuid()
    }))
    .query(async ({ input, ctx }) => {
      try {
        const session = await prisma.callSession.findUnique({
          where: { id: input.sessionId },
          include: {
            agent: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            },
            callOutcomes: {
              include: {
                recordedByAgent: {
                  select: {
                    firstName: true,
                    lastName: true
                  }
                }
              }
            }
          }
        });

        if (!session) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Call session not found'
          });
        }

        // Check permissions - agents can only see their own calls
        if (ctx.agent.role === 'agent' && session.agentId !== ctx.agent.id) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Access denied'
          });
        }

        // Get user context
        const userContext = await callService['getUserCallContext'](Number(session.userId));

        return {
          ...session,
          userContext,
          agent: session.agent
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get call session'
        });
      }
    }),

  // Get today's call summary for agent dashboard
  getTodaysSummary: protectedProcedure
    .query(async ({ ctx }) => {
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const analytics = await callService.getCallAnalytics({
          agentId: ctx.agent.id,
          startDate: today,
          endDate: new Date()
        });

        return {
          callsToday: analytics.totalCalls,
          contactsToday: analytics.successfulContacts,
          avgTalkTime: analytics.avgTalkTimeMinutes,
          contactRate: analytics.contactRate
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get today\'s summary'
        });
      }
    }),

  // Get call history formatted for table display
  getCallHistoryTable: protectedProcedure
    .input(CallHistoryFiltersSchema)
    .query(async ({ input, ctx }) => {
      try {
        // If not admin/supervisor, limit to agent's own calls
        const filters = { ...input };
        if (ctx.agent.role === 'agent') {
          filters.agentId = ctx.agent.id;
        }

        // Get call sessions with outcomes and user/agent details
        const callSessions = await prisma.callSession.findMany({
          where: {
            ...(filters.agentId && { agentId: filters.agentId }),
            ...(filters.userId && { userId: filters.userId }),
            ...(filters.startDate && { startedAt: { gte: filters.startDate } }),
            ...(filters.endDate && { startedAt: { lte: filters.endDate } }),
            ...(filters.status && { status: filters.status })
          },
          include: {
            agent: {
              select: {
                firstName: true,
                lastName: true
              }
            },
            callOutcomes: {
              orderBy: { createdAt: 'desc' },
              take: 1
            }
          },
          orderBy: { startedAt: 'desc' },
          skip: (filters.page - 1) * filters.limit,
          take: filters.limit
        });

        // Get user details from replica DB for each call
        const userIds = [...new Set(callSessions.map((call: any) => call.userId))];
        const users = userIds.length > 0 ? await prisma.$queryRaw`
          SELECT id, first_name, last_name, phone_number 
          FROM users 
          WHERE id IN (${userIds.join(',')})
        ` as Array<{
          id: number;
          first_name: string;
          last_name: string;
          phone_number: string;
        }> : [];

        const userMap = new Map(users.map(user => [user.id, user]));

        // Format for table display
        const formattedCalls = callSessions.map((session: any) => {
          const user = userMap.get(Number(session.userId));
          const outcome = session.callOutcomes[0];
          
          return {
            id: session.id,
            userId: Number(session.userId),
            userName: user ? `${user.first_name} ${user.last_name}` : 'Unknown User',
            userPhone: user?.phone_number || 'Unknown',
            agentId: session.agentId,
            agentName: `${session.agent.firstName} ${session.agent.lastName}`,
            startedAt: session.startedAt,
            endedAt: session.endedAt,
            durationSeconds: session.durationSeconds,
            talkTimeSeconds: session.talkTimeSeconds,
            outcome: outcome?.outcomeType || 'no_outcome',
            outcomeNotes: outcome?.outcomeNotes,
            magicLinkSent: outcome?.magicLinkSent || false,
            smsSent: outcome?.smsSent || false,
            nextCallDelay: outcome?.nextCallDelayHours,
            documentsRequested: outcome?.documentsRequested ? JSON.parse(outcome.documentsRequested) : [],
            twilioCallSid: session.twilioCallSid
          };
        });

        const total = await prisma.callSession.count({
          where: {
            ...(filters.agentId && { agentId: filters.agentId }),
            ...(filters.userId && { userId: filters.userId }),
            ...(filters.startDate && { startedAt: { gte: filters.startDate } }),
            ...(filters.endDate && { startedAt: { lte: filters.endDate } }),
            ...(filters.status && { status: filters.status })
          }
        });

        return {
          calls: formattedCalls,
          meta: {
            page: filters.page,
            limit: filters.limit,
            total,
            totalPages: Math.ceil(total / filters.limit)
          }
        };
      } catch (error) {
        logger.error('Failed to get call history table', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get call history'
        });
      }
    })
}); 