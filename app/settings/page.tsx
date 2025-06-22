"use client";

import React, { useState, useEffect } from 'react';
import { useSession, signIn } from 'next-auth/react';

// Define a type for the subscription data we expect
interface Subscription {
  id: string;
  razorpaySubscriptionId: string;
  razorpayPlanId: string;
  status: string; // e.g., "active", "pending", "halted", "cancelled", "completed"
  currentPeriodEnd: string | null; // ISO date string
  // Add any other fields you expect from your API, like plan name if resolved
  planName?: string; // Example: if you resolve planId to a name
}

export default function SettingsPage() {
  const { data: session, status: sessionStatus } = useSession();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    if (sessionStatus === 'authenticated') {
      fetchSubscription();
    }
  }, [sessionStatus]);

  const fetchSubscription = async () => {
    setIsLoading(true);
    setError(null);
    setActionMessage(null);
    try {
      const response = await fetch('/api/user/get-subscription');
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to fetch subscription details.');
      }
      const data = await response.json();
      setSubscription(data.subscription); // API returns { subscription: object | null }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!subscription || !subscription.razorpaySubscriptionId) {
      setError('No active subscription to cancel or subscription ID missing.');
      return;
    }
    if (subscription.status === 'cancelled' || subscription.status === 'completed') {
      setActionMessage(`Subscription is already ${subscription.status}.`);
      return;
    }


    setIsLoading(true);
    setError(null);
    setActionMessage(null);
    try {
      const response = await fetch('/api/razorpay/cancel-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ razorpay_subscription_id: subscription.razorpaySubscriptionId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to cancel subscription.');
      }

      setActionMessage(data.message || 'Subscription cancellation initiated successfully.');
      // Re-fetch subscription details to reflect the change (e.g., status might become 'pending_cancellation' or similar)
      // Or update local state optimistically based on `data` from cancellation API.
      // For cancel_at_cycle_end, the status might remain 'active' but with a cancellation scheduled.
      // The webhook will be the source of truth for final status.
      fetchSubscription();

    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (sessionStatus === 'loading') {
    return <p>Loading session...</p>;
  }

  if (sessionStatus === 'unauthenticated') {
    return (
      <div>
        <p>You must be signed in to view this page.</p>
        <button onClick={() => signIn()}>Sign In</button>
      </div>
    );
  }

  // Basic styling - replace with your actual layout and styling components
  const cardStyle: React.CSSProperties = {
    border: '1px solid #ccc',
    padding: '20px',
    margin: '20px auto',
    maxWidth: '600px',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  };

  const buttonStyle: React.CSSProperties = {
    padding: '10px 15px',
    backgroundColor: '#0070f3',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    marginRight: '10px',
  };

  const cancelButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    backgroundColor: '#dc3545',
  };


  return (
    <div style={{ padding: '2rem', fontFamily: 'Arial, sans-serif' }}>
      <h1>Account Settings</h1>

      <div style={cardStyle}>
        <h2>Subscription Management</h2>
        {isLoading && <p>Loading subscription details...</p>}
        {error && <p style={{ color: 'red' }}>Error: {error}</p>}
        {actionMessage && <p style={{ color: 'green' }}>{actionMessage}</p>}

        {!isLoading && !error && (
          <>
            {subscription ? (
              <div>
                <p><strong>Status:</strong> {subscription.status}</p>
                <p><strong>Plan ID:</strong> {subscription.razorpayPlanId}</p>
                {/* In a real app, you'd map razorpayPlanId to a human-readable name */}
                {subscription.currentPeriodEnd && (
                  <p>
                    <strong>
                      {subscription.status === 'active' && new Date(subscription.currentPeriodEnd) > new Date()
                        ? 'Next Billing Date / Renews On:'
                        : 'Access Valid Until:'}
                    </strong>{' '}
                    {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                  </p>
                )}
                {(subscription.status === 'active' || subscription.status === 'halted' || subscription.status === 'pending') && (
                  <button
                    style={cancelButtonStyle}
                    onClick={handleCancelSubscription}
                    disabled={isLoading}
                  >
                    {isLoading ? 'Processing...' : 'Cancel Subscription'}
                  </button>
                )}
                 {subscription.status === 'cancelled' && <p>This subscription has been cancelled.</p>}
                 {subscription.status === 'completed' && <p>This subscription has completed its term.</p>}
              </div>
            ) : (
              <p>You do not have an active subscription.</p>
            )}
            <button style={{...buttonStyle, marginTop: '10px', backgroundColor: '#6c757d'}} onClick={fetchSubscription} disabled={isLoading}>
                {isLoading ? 'Refreshing...' : 'Refresh Subscription Info'}
            </button>
          </>
        )}
      </div>
      {/* Add other settings sections here, e.g., profile management */}
    </div>
  );
}
