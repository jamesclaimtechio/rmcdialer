'use client';

import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/trpc/client';
import { 
  ArrowLeft,
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  FileText,
  AlertTriangle,
  Clock,
  Building,
  Shield
} from 'lucide-react';
import { Button } from '@/modules/core/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/core/components/ui/card';
import { Badge } from '@/modules/core/components/ui/badge';
import { Alert, AlertDescription } from '@/modules/core/components/ui/alert';
import { useToast } from '@/modules/core/hooks/use-toast';

export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const userId = params.userId as string;

  // Fetch user details
  const { 
    data: userDetailsResponse, 
    isLoading, 
    error 
  } = api.users.getCompleteUserDetails.useQuery(
    { userId: parseInt(userId) },
    { enabled: !!userId && !isNaN(parseInt(userId)) }
  );

  const userDetails = userDetailsResponse?.data;

  // Determine queue type for this user
  const { data: queueType } = api.users.determineUserQueueType.useQuery(
    { userId: parseInt(userId) },
    { enabled: !!userId && !isNaN(parseInt(userId)) }
  );

  if (isLoading) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <User className="h-8 w-8 animate-pulse text-blue-600 mx-auto mb-4" />
            <p className="text-gray-600">Loading user details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !userDetails) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {error?.message || 'User not found'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const user = userDetails.user;

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'completed': return 'bg-blue-100 text-blue-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => router.back()}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {user.firstName} {user.lastName}
            </h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-gray-600">User ID: {user.id}</span>
              {queueType?.data?.queueType && (
                <Badge variant="outline" className="text-xs">
                  {queueType.data.queueType === 'unsigned_users' ? 'Needs Signature' : 
                   queueType.data.queueType === 'outstanding_requests' ? 'Has Requirements' : 
                   'Callback Queue'}
                </Badge>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex gap-3">
          <Button 
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(user.phoneNumber || '');
              toast({ title: "Phone number copied to clipboard" });
            }}
          >
            <Phone className="w-4 h-4 mr-2" />
            {user.phoneNumber}
          </Button>
          <Button 
            onClick={() => router.push(`/calls/${user.id}`)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Phone className="w-4 h-4 mr-2" />
            Start Call
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Personal Info */}
        <div className="space-y-6">
          {/* Contact Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Contact Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-gray-500" />
                  <div>
                    <div className="text-sm text-gray-500">Email</div>
                    <div className="font-medium">{user.email || 'Not provided'}</div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-gray-500" />
                  <div>
                    <div className="text-sm text-gray-500">Phone</div>
                    <div className="font-medium">{user.phoneNumber || 'Not provided'}</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Calendar className="w-4 h-4 text-gray-500" />
                  <div>
                    <div className="text-sm text-gray-500">Date of Birth</div>
                    <div className="font-medium">
                      {user.dateOfBirth ? new Date(user.dateOfBirth).toLocaleDateString() : 'Not provided'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Shield className="w-4 h-4 text-gray-500" />
                  <div>
                    <div className="text-sm text-gray-500">Status</div>
                    <Badge className={getStatusColor(user.status)}>
                      {user.status || 'Unknown'}
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Addresses Information */}
          {userDetails.addresses && userDetails.addresses.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="w-5 h-5" />
                  Addresses ({userDetails.addresses.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {userDetails.addresses.map((address, index) => (
                  <div key={address.id} className="border-b last:border-b-0 pb-4 last:pb-0">
                    <div className="flex items-center justify-between mb-2">
                      <Badge 
                        variant={address.type?.toLowerCase().includes('current') ? 'default' : 'outline'} 
                        className="text-xs"
                      >
                        {address.type || 'Unknown Type'}
                      </Badge>
                      {address.createdAt && (
                        <div className="text-xs text-gray-500">
                          Added {new Date(address.createdAt).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                    <div className="space-y-1">
                      <div className="font-medium">{address.fullAddress}</div>
                      <div className="text-sm text-gray-600">
                        {address.postCode} • {address.county}
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Account Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="w-5 h-5" />
                Account Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <div className="text-sm text-gray-500">Introducer</div>
                <div className="font-medium">{user.introducer}</div>
              </div>
              {user.solicitor && (
                <div>
                  <div className="text-sm text-gray-500">Solicitor</div>
                  <div className="font-medium">{user.solicitor}</div>
                </div>
              )}
              <div>
                <div className="text-sm text-gray-500">Account Created</div>
                <div className="font-medium">
                  {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Unknown'}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Last Login</div>
                <div className="font-medium">
                  {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Claims & Requirements */}
        <div className="lg:col-span-2 space-y-6">
          {/* Claims Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Claims ({userDetails.claims.length})
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {userDetails.claims.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">No claims found</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {userDetails.claims.map((claim: any) => (
                    <div key={claim.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold">
                              {claim.type} Claim
                            </h3>
                            <Badge className={getStatusColor(claim.status)}>
                              {claim.status}
                            </Badge>
                          </div>
                          <div className="text-sm text-gray-600">
                            <strong>Lender:</strong> {claim.lender}
                          </div>
                          {claim.solicitor && (
                            <div className="text-sm text-gray-600">
                              <strong>Solicitor:</strong> {claim.solicitor}
                            </div>
                          )}
                        </div>
                        <div className="text-right text-sm text-gray-500">
                          <div>Created: {claim.createdAt ? new Date(claim.createdAt).toLocaleDateString() : 'Unknown'}</div>
                          {claim.lastUpdated && (
                            <div>Updated: {new Date(claim.lastUpdated).toLocaleDateString()}</div>
                          )}
                        </div>
                      </div>

                      {/* Requirements */}
                      {claim.requirements && claim.requirements.length > 0 && (
                        <div className="mt-3 pt-3 border-t">
                          <h4 className="font-medium mb-2 flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4" />
                            Requirements ({claim.requirements.length})
                          </h4>
                          <div className="space-y-2">
                            {claim.requirements.map((req: any) => (
                              <div key={req.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                                <div>
                                  <div className="font-medium text-sm">{req.type}</div>
                                  {req.reason && (
                                    <div className="text-xs text-gray-600">{req.reason}</div>
                                  )}
                                  {req.rejectionReason && (
                                    <div className="text-xs text-red-600">
                                      <strong>Rejected:</strong> {req.rejectionReason}
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge 
                                    variant={req.status === 'PENDING' ? 'destructive' : 'default'}
                                    className="text-xs"
                                  >
                                    {req.status}
                                  </Badge>
                                  <div className="text-xs text-gray-500">
                                    {req.createdAt ? new Date(req.createdAt).toLocaleDateString() : 'Unknown'}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Activity */}
          {userDetails.activityLogs && userDetails.activityLogs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {userDetails.activityLogs.slice(0, 5).map((log: any) => (
                    <div key={log.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded">
                      <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                      <div className="flex-1">
                        <div className="font-medium text-sm">{log.action}</div>
                        <div className="text-sm text-gray-600">{log.message}</div>
                        {log.createdAt && (
                          <div className="text-xs text-gray-500 mt-1">
                            {new Date(log.createdAt).toLocaleString()}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
} 