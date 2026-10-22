import React, { useState } from 'react';
import { CheckCircle, CreditCard } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/auth/AuthContext';

export default function AdminIDCard() {
  const { profile } = useAuth();

  const storageKey = profile?.school_id ? `veducore_idcard_request_${profile.school_id}` : null;
  const existingRequest = storageKey
    ? (() => { try { return JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch { return null; } })()
    : null;

  const [formSubmitted, setFormSubmitted] = useState(!!existingRequest);
  const [formData, setFormData] = useState({
    contactName: '',
    contactPhone: '',
    studentCount: '',
    deliveryDate: '',
    notes: '',
  });

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (storageKey) {
      localStorage.setItem(storageKey, JSON.stringify({
        schoolId: profile?.school_id,
        submittedAt: new Date().toISOString(),
        ...formData,
        status: 'pending',
      }));
    }
    setFormSubmitted(true);
  }

  return (
    <DashboardLayout title="ID Cards">
      <div className="flex justify-center">
      <div className="w-full max-w-2xl space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100">
            <CreditCard className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Student ID Cards</h2>
            <p className="text-sm text-gray-500">Designed & printed by Veducore using your ERP data</p>
          </div>
        </div>

        {/* Form / Confirmation */}
        <Card className="p-6">
          {!formSubmitted ? (
            <>
              <p className="text-sm text-gray-600 mb-5">
                Fill in your requirements below. The Veducore team will reach out within 24 hours.
              </p>
              <form onSubmit={handleFormSubmit} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Contact Person Name</label>
                    <input
                      type="text"
                      value={formData.contactName}
                      onChange={e => setFormData(f => ({ ...f, contactName: e.target.value }))}
                      placeholder="e.g. Rajesh Kumar"
                      required
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Contact Phone</label>
                    <input
                      type="tel"
                      value={formData.contactPhone}
                      onChange={e => setFormData(f => ({ ...f, contactPhone: e.target.value }))}
                      placeholder="+91 98765 43210"
                      required
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Number of Students</label>
                    <input
                      type="number"
                      value={formData.studentCount}
                      onChange={e => setFormData(f => ({ ...f, studentCount: e.target.value }))}
                      placeholder="e.g. 500"
                      min="1"
                      required
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Preferred Delivery Date</label>
                    <input
                      type="date"
                      value={formData.deliveryDate}
                      onChange={e => setFormData(f => ({ ...f, deliveryDate: e.target.value }))}
                      required
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Additional Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={e => setFormData(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Any special requirements or custom fields..."
                    rows={3}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>
                <div className="pt-1 flex gap-3">
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center gap-2 rounded-lg h-10 px-5 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  >
                    Submit Application
                  </button>
                  <a
                    href="tel:+919999999999"
                    className="inline-flex items-center justify-center gap-2 rounded-lg h-10 px-4 text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    📞 Call Us Instead
                  </a>
                </div>
              </form>
            </>
          ) : (
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-green-100">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Application Submitted!</p>
                <p className="mt-1 text-sm text-gray-600">
                  The Veducore team will contact you within 24 hours to proceed with your ID cards.
                </p>
                {existingRequest?.submittedAt && (
                  <p className="mt-2 text-xs text-gray-400">
                    Submitted on{' '}
                    {new Date(existingRequest.submittedAt).toLocaleDateString('en-IN', {
                      day: '2-digit', month: 'short', year: 'numeric',
                    })}
                  </p>
                )}
              </div>
            </div>
          )}
        </Card>

      </div>
      </div>
    </DashboardLayout>
  );
}
