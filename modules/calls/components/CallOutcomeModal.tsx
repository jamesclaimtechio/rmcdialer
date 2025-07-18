'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/core/components/ui/card';
import { Button } from '@/modules/core/components/ui/button';
import { Input } from '@/modules/core/components/ui/input';
import { Label } from '@/modules/core/components/ui/label';
import { Select } from '@/modules/core/components/ui/select';
import { Badge } from '@/modules/core/components/ui/badge';
import { 
  Phone, 
  PhoneOff, 
  Clock, 
  MessageSquare, 
  Calendar,
  Mail,
  CheckCircle,
  XCircle,
  AlertCircle,
  FileText,
  Send
} from 'lucide-react';
import type { CallOutcomeOptions, UserCallContext } from '../types/call.types';

interface CallOutcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (outcome: CallOutcomeOptions) => Promise<void>;
  callSessionId: string;
  userContext: UserCallContext;
  callDuration: number; // in seconds
  isSubmitting?: boolean;
}

const OUTCOME_TYPES = [
  {
    type: 'contacted' as const,
    label: 'Successfully Contacted',
    icon: CheckCircle,
    color: 'bg-green-500',
    description: 'Spoke with the customer and discussed their claim'
  },
  {
    type: 'no_answer' as const,
    label: 'No Answer',
    icon: PhoneOff,
    color: 'bg-yellow-500',
    description: 'Phone rang but no one answered'
  },
  {
    type: 'left_voicemail' as const,
    label: 'Left Voicemail',
    icon: MessageSquare,
    color: 'bg-blue-500',
    description: 'Left a voicemail message for the customer'
  },
  {
    type: 'busy' as const,
    label: 'Line Busy',
    icon: Phone,
    color: 'bg-orange-500',
    description: 'Phone line was busy'
  },
  {
    type: 'callback_requested' as const,
    label: 'Callback Requested',
    icon: Calendar,
    color: 'bg-purple-500',
    description: 'Customer requested a callback at specific time'
  },
  {
    type: 'not_interested' as const,
    label: 'Not Interested',
    icon: XCircle,
    color: 'bg-red-500',
    description: 'Customer is not interested in proceeding'
  },
  {
    type: 'wrong_number' as const,
    label: 'Wrong Number',
    icon: AlertCircle,
    color: 'bg-gray-500',
    description: 'Reached wrong person or number is incorrect'
  },
  {
    type: 'failed' as const,
    label: 'Call Failed',
    icon: XCircle,
    color: 'bg-red-600',
    description: 'Technical issues or call could not connect'
  }
];

const DOCUMENT_TYPES = [
  'ID_DOCUMENT',
  'BANK_STATEMENTS', 
  'CREDIT_STATEMENTS',
  'PROOF_OF_ADDRESS',
  'INCOME_VERIFICATION',
  'VEHICLE_DOCUMENTS',
  'LOAN_AGREEMENT'
];

export function CallOutcomeModal({
  isOpen,
  onClose,
  onSubmit,
  callSessionId,
  userContext,
  callDuration,
  isSubmitting = false
}: CallOutcomeModalProps) {
  const [selectedOutcome, setSelectedOutcome] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [smsSent, setSmsSent] = useState(false);
  const [documentsRequested, setDocumentsRequested] = useState<string[]>([]);
  const [callbackDateTime, setCallbackDateTime] = useState('');
  const [callbackReason, setCallbackReason] = useState('');

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleDocumentToggle = (docType: string) => {
    setDocumentsRequested(prev => 
      prev.includes(docType)
        ? prev.filter(d => d !== docType)
        : [...prev, docType]
    );
  };

  const handleSubmit = async () => {
    if (!selectedOutcome) return;

    const outcome: CallOutcomeOptions = {
      outcomeType: selectedOutcome as any,
      outcomeNotes: notes.trim() || undefined,
      magicLinkSent,
      smsSent,
      documentsRequested: documentsRequested.length > 0 ? documentsRequested : undefined,
      ...(selectedOutcome === 'callback_requested' && callbackDateTime && {
        callbackDateTime: new Date(callbackDateTime),
        callbackReason: callbackReason.trim() || 'Customer requested callback'
      })
    };

    await onSubmit(outcome);
  };

  const selectedOutcomeData = OUTCOME_TYPES.find(o => o.type === selectedOutcome);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="bg-gradient-to-r from-blue-600 to-purple-600 text-white">
          <CardTitle className="flex items-center gap-3">
            <Phone className="w-6 h-6" />
            Call Outcome - {userContext.firstName} {userContext.lastName}
          </CardTitle>
          <div className="flex items-center gap-4 text-blue-100">
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              Duration: {formatDuration(callDuration)}
            </div>
            <div className="flex items-center gap-1">
              <Phone className="w-4 h-4" />
              {userContext.phoneNumber}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          {/* User Context Summary */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-semibold mb-2">Customer Summary</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium">Claims:</span> {userContext.claims.length}
              </div>
              <div>
                <span className="font-medium">Pending Requirements:</span>{' '}
                {userContext.claims.reduce((acc, claim) => acc + claim.requirements.filter(r => r.status === 'PENDING').length, 0)}
              </div>
              {userContext.claims.length > 0 && (
                <>
                  <div>
                    <span className="font-medium">Primary Claim:</span> {userContext.claims[0].type}
                  </div>
                  <div>
                    <span className="font-medium">Lender:</span> {userContext.claims[0].lender}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Outcome Selection */}
          <div>
            <Label className="text-base font-semibold mb-3 block">Call Outcome *</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {OUTCOME_TYPES.map((outcome) => {
                const Icon = outcome.icon;
                const isSelected = selectedOutcome === outcome.type;
                
                return (
                  <button
                    key={outcome.type}
                    onClick={() => setSelectedOutcome(outcome.type)}
                    className={`p-3 rounded-lg border-2 transition-all text-left ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-3 h-3 rounded-full ${outcome.color}`} />
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="font-medium text-sm">{outcome.label}</div>
                    <div className="text-xs text-gray-500 mt-1">{outcome.description}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Callback Scheduling (if callback requested) */}
          {selectedOutcome === 'callback_requested' && (
            <div className="border rounded-lg p-4 bg-purple-50">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Schedule Callback
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="callback-datetime">Callback Date & Time *</Label>
                  <Input
                    id="callback-datetime"
                    type="datetime-local"
                    value={callbackDateTime}
                    onChange={(e) => setCallbackDateTime(e.target.value)}
                    min={new Date().toISOString().slice(0, 16)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="callback-reason">Reason for Callback</Label>
                  <Input
                    id="callback-reason"
                    value={callbackReason}
                    onChange={(e) => setCallbackReason(e.target.value)}
                    placeholder="e.g., Customer preferred different time"
                    className="mt-1"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Actions Taken */}
          <div>
            <Label className="text-base font-semibold mb-3 block">Actions Taken</Label>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="magic-link"
                  checked={magicLinkSent}
                  onChange={(e) => setMagicLinkSent(e.target.checked)}
                  className="rounded"
                />
                <Label htmlFor="magic-link" className="flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  Sent Magic Link (passwordless access to claim portal)
                </Label>
              </div>
              
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="sms-sent"
                  checked={smsSent}
                  onChange={(e) => setSmsSent(e.target.checked)}
                  className="rounded"
                />
                <Label htmlFor="sms-sent" className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Sent SMS follow-up message
                </Label>
              </div>
            </div>
          </div>

          {/* Documents Requested */}
          <div>
            <Label className="text-base font-semibold mb-3 block">Documents Requested</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {DOCUMENT_TYPES.map((docType) => (
                <button
                  key={docType}
                  onClick={() => handleDocumentToggle(docType)}
                  className={`p-2 rounded-lg border text-sm transition-colors ${
                    documentsRequested.includes(docType)
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <FileText className="w-3 h-3" />
                    {docType.replace(/_/g, ' ')}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="notes" className="text-base font-semibold mb-3 block">
              Call Notes
            </Label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add detailed notes about the conversation, customer responses, concerns, or any other relevant information..."
              className="w-full p-3 border rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows={4}
            />
            <div className="text-sm text-gray-500 mt-1">
              {notes.length}/500 characters
            </div>
          </div>

          {/* Summary */}
          {selectedOutcomeData && (
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold mb-2">Summary</h3>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-3 h-3 rounded-full ${selectedOutcomeData.color}`} />
                <span className="font-medium">{selectedOutcomeData.label}</span>
              </div>
              <div className="text-sm text-gray-600">
                {selectedOutcomeData.description}
              </div>
              {notes && (
                <div className="mt-2 text-sm">
                  <span className="font-medium">Notes:</span> {notes.slice(0, 100)}
                  {notes.length > 100 && '...'}
                </div>
              )}
            </div>
          )}
        </CardContent>

        {/* Actions */}
        <div className="border-t p-4 bg-gray-50 flex justify-between">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          
          <Button
            onClick={handleSubmit}
            disabled={!selectedOutcome || isSubmitting || (selectedOutcome === 'callback_requested' && !callbackDateTime)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isSubmitting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                Saving...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Save Outcome
              </>
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
} 