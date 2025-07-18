'use client'

import React, { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/core/components/ui/card'
import { Badge } from '@/modules/core/components/ui/badge'
import { Button } from '@/modules/core/components/ui/button'
import { Input } from '@/modules/core/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/core/components/ui/select'
import { Clock, Phone, MessageSquare, Calendar, User, Filter, ChevronDown, ChevronUp } from 'lucide-react'
import { format, subDays, isAfter, isBefore } from 'date-fns'
import type { CallHistoryEntry } from '../types/call.types'

interface CallHistoryTableProps {
  userId?: number
  agentId?: number
  calls: CallHistoryEntry[]
  isLoading?: boolean
  onRefresh?: () => void
  showUserInfo?: boolean
}

interface Filters {
  outcome: string
  dateRange: string
  agent: string
  search: string
}

const OUTCOME_COLORS: Record<string, string> = {
  'contacted': 'bg-green-100 text-green-800',
  'no_answer': 'bg-yellow-100 text-yellow-800',
  'voicemail': 'bg-blue-100 text-blue-800',
  'busy': 'bg-orange-100 text-orange-800',
  'wrong_number': 'bg-red-100 text-red-800',
  'not_interested': 'bg-gray-100 text-gray-800',
  'callback_requested': 'bg-purple-100 text-purple-800',
  'documents_discussed': 'bg-indigo-100 text-indigo-800',
  'magic_link_sent': 'bg-cyan-100 text-cyan-800',
}

export function CallHistoryTable({ 
  userId, 
  agentId, 
  calls, 
  isLoading, 
  onRefresh, 
  showUserInfo = true 
}: CallHistoryTableProps) {
  const [filters, setFilters] = useState<Filters>({
    outcome: 'all',
    dateRange: 'all',
    agent: 'all',
    search: ''
  })
  const [sortBy, setSortBy] = useState<'date' | 'duration' | 'outcome'>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [expandedCall, setExpandedCall] = useState<string | null>(null)

  // Filter and sort calls
  const filteredAndSortedCalls = useMemo(() => {
    let filtered = calls.filter(call => {
      // Outcome filter
      if (filters.outcome !== 'all' && call.outcome !== filters.outcome) {
        return false
      }

      // Date range filter
      if (filters.dateRange !== 'all') {
        const callDate = new Date(call.startedAt)
        const now = new Date()
        
        switch (filters.dateRange) {
          case 'today':
            if (!isAfter(callDate, subDays(now, 1))) return false
            break
          case 'week':
            if (!isAfter(callDate, subDays(now, 7))) return false
            break
          case 'month':
            if (!isAfter(callDate, subDays(now, 30))) return false
            break
        }
      }

      // Agent filter
      if (filters.agent !== 'all' && call.agentName !== filters.agent) {
        return false
      }

      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase()
        return (
          call.userName?.toLowerCase().includes(searchLower) ||
          call.userPhone?.toLowerCase().includes(searchLower) ||
          call.outcomeNotes?.toLowerCase().includes(searchLower) ||
          call.agentName?.toLowerCase().includes(searchLower)
        )
      }

      return true
    })

    // Sort calls
    filtered.sort((a, b) => {
      let comparison = 0
      
      switch (sortBy) {
        case 'date':
          comparison = new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
          break
        case 'duration':
          comparison = (a.durationSeconds || 0) - (b.durationSeconds || 0)
          break
        case 'outcome':
          comparison = a.outcome.localeCompare(b.outcome)
          break
      }

      return sortOrder === 'desc' ? -comparison : comparison
    })

    return filtered
  }, [calls, filters, sortBy, sortOrder])

  const formatDuration = (seconds: number | null | undefined) => {
    if (!seconds) return 'N/A'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getOutcomeDisplay = (outcome: string) => {
    return outcome.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  const uniqueOutcomes = Array.from(new Set(calls.map(call => call.outcome)))
  const uniqueAgents = Array.from(new Set(calls.map(call => call.agentName).filter(Boolean)))

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Call History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-2">Loading call history...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Call History
            <Badge variant="secondary">{filteredAndSortedCalls.length} calls</Badge>
          </CardTitle>
          {onRefresh && (
            <Button variant="outline" size="sm" onClick={onRefresh}>
              Refresh
            </Button>
          )}
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
          <div>
            <Input
              placeholder="Search calls..."
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              className="w-full"
            />
          </div>
          
          <Select value={filters.outcome} onValueChange={(value) => setFilters(prev => ({ ...prev, outcome: value }))}>
            <SelectTrigger>
              <SelectValue placeholder="All Outcomes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Outcomes</SelectItem>
              {uniqueOutcomes.map(outcome => (
                <SelectItem key={outcome} value={outcome}>
                  {getOutcomeDisplay(outcome)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filters.dateRange} onValueChange={(value) => setFilters(prev => ({ ...prev, dateRange: value }))}>
            <SelectTrigger>
              <SelectValue placeholder="All Time" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
            </SelectContent>
          </Select>

          {uniqueAgents.length > 1 && (
            <Select value={filters.agent} onValueChange={(value) => setFilters(prev => ({ ...prev, agent: value }))}>
              <SelectTrigger>
                <SelectValue placeholder="All Agents" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Agents</SelectItem>
                {uniqueAgents.map(agent => (
                  <SelectItem key={agent} value={agent!}>
                    {agent}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {filteredAndSortedCalls.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Phone className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">No call history found</p>
            <p className="text-sm">Try adjusting your filters or make some calls!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Sort Controls */}
            <div className="flex items-center gap-4 text-sm">
              <span className="text-gray-500">Sort by:</span>
              {(['date', 'duration', 'outcome'] as const).map(option => (
                <Button
                  key={option}
                  variant={sortBy === option ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => {
                    if (sortBy === option) {
                      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
                    } else {
                      setSortBy(option)
                      setSortOrder('desc')
                    }
                  }}
                  className="flex items-center gap-1"
                >
                  {option.charAt(0).toUpperCase() + option.slice(1)}
                  {sortBy === option && (
                    sortOrder === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                  )}
                </Button>
              ))}
            </div>

            {/* Call List */}
            <div className="space-y-3">
              {filteredAndSortedCalls.map((call) => (
                <div key={call.id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {showUserInfo && (
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            <User className="h-4 w-4" />
                            {call.userName || 'Unknown User'}
                          </div>
                          <div className="text-sm text-gray-500">{call.userPhone}</div>
                        </div>
                      )}
                      
                      <div>
                        <div className="text-sm text-gray-500">
                          {format(new Date(call.startedAt), 'MMM d, yyyy HH:mm')}
                        </div>
                        <div className="text-sm font-medium">{call.agentName}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-sm font-medium">
                          {formatDuration(call.durationSeconds)}
                        </div>
                        <div className="text-xs text-gray-500">
                          {call.talkTimeSeconds ? formatDuration(call.talkTimeSeconds) + ' talk' : 'No talk time'}
                        </div>
                      </div>

                      <Badge className={OUTCOME_COLORS[call.outcome] || 'bg-gray-100 text-gray-800'}>
                        {getOutcomeDisplay(call.outcome)}
                      </Badge>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandedCall(expandedCall === call.id ? null : call.id)}
                      >
                        {expandedCall === call.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {expandedCall === call.id && (
                    <div className="mt-4 pt-4 border-t space-y-3">
                      {call.outcomeNotes && (
                        <div>
                          <div className="text-sm font-medium text-gray-700 mb-1">Notes:</div>
                          <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                            {call.outcomeNotes}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        {call.magicLinkSent && (
                          <div className="flex items-center gap-1 text-blue-600">
                            <MessageSquare className="h-3 w-3" />
                            Magic Link Sent
                          </div>
                        )}
                        
                        {call.smsSent && (
                          <div className="flex items-center gap-1 text-green-600">
                            <MessageSquare className="h-3 w-3" />
                            SMS Sent
                          </div>
                        )}

                        {call.nextCallDelay && (
                          <div className="flex items-center gap-1 text-purple-600">
                            <Calendar className="h-3 w-3" />
                            Next call in {call.nextCallDelay}h
                          </div>
                        )}

                        {call.documentsRequested && call.documentsRequested.length > 0 && (
                          <div className="col-span-2">
                            <div className="text-sm font-medium text-gray-700 mb-1">Documents Requested:</div>
                            <div className="flex flex-wrap gap-1">
                              {call.documentsRequested.map((doc, index) => (
                                <Badge key={index} variant="outline" className="text-xs">
                                  {doc}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
} 