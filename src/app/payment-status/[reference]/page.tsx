import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';

export default async function PaymentStatusPage({ params }: { params: { reference: string } }) {
  const supabase = await createClient();
  const { data: payment } = await supabase
    .from('payments')
    .select('status, amount, month, created_at, confirmed_at, companies(name)')
    .eq('id', params.reference)
    .single();

  if (!payment) notFound();

  const companyName = payment.companies?.[0]?.name || 'Unknown Company';

  const statusText = {
    pending: 'Waiting for payment confirmation',
    confirmed: 'Payment confirmed – subscription active',
    failed: 'Payment failed – please contact support',
  };

  return (
    <div style={{ maxWidth: 500, margin: '40px auto', textAlign: 'center' }}>
      <h1>Payment Status</h1>
      <p>Company: {companyName}</p>
      <p>Amount: ${payment.amount} for {payment.month}</p>
      <p>Status: <strong>{statusText[payment.status as keyof typeof statusText]}</strong></p>
      {payment.status === 'pending' && (
        <p style={{ color: '#d97706' }}>We'll activate your account within 2 business hours after receiving the funds.</p>
      )}
      {payment.status === 'confirmed' && (
        <p style={{ color: '#16a34a' }}>✓ Your subscription is active. You can now use Slipdesk.</p>
      )}
    </div>
  );
}