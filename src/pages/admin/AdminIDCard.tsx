import React, { useState } from 'react';
import { Camera, User, BookOpen, Hash, Calendar, Building2, Phone, Clock, CheckCircle } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';

const includedItems = [
  { icon: <Camera className="h-5 w-5 text-blue-600" />, label: 'Student Photo' },
  { icon: <User className="h-5 w-5 text-blue-600" />, label: 'Full Name' },
  { icon: <BookOpen className="h-5 w-5 text-blue-600" />, label: 'Class & Section' },
  { icon: <Hash className="h-5 w-5 text-blue-600" />, label: 'Admission Number' },
  { icon: <Calendar className="h-5 w-5 text-blue-600" />, label: 'Date of Birth' },
  { icon: <Building2 className="h-5 w-5 text-blue-600" />, label: 'School Name & Logo' },
  { icon: <Phone className="h-5 w-5 text-blue-600" />, label: 'Parent Contact (optional)' },
  { icon: <Clock className="h-5 w-5 text-blue-600" />, label: 'Valid Until Year' },
];

const steps = [
  { num: 1, title: 'Fill in the apply form below', desc: 'Provide your school details and requirements.' },
  { num: 2, title: 'Veducore team reviews your request', desc: 'Our team will verify your details and prepare the ID cards.' },
  { num: 3, title: 'ID cards are generated and delivered', desc: 'Print-ready files or physical cards delivered to your school.' },
];

const primaryLink =
  'inline-flex items-center justify-center gap-2 rounded-lg h-10 px-4 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/40';
const outlineLink =
  'inline-flex items-center justify-center gap-2 rounded-lg h-10 px-4 text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/40';

export default function AdminIDCard() {
  const callHref = 'tel:+919999999999';
  const emailHref = 'mailto:idcards@veducore.com';

  const [formSubmitted, setFormSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    schoolName: 'Your School',
    contactName: '',
    contactPhone: '',
    studentCount: '',
    deliveryDate: '',
    notes: '',
  });

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormSubmitted(true);
  }

  return (
    <DashboardLayout title="ID Cards">
      <div className="space-y-8">

        {/* Hero */}
        <Card className="p-6 sm:p-8">
          <h2 className="text-2xl font-bold text-gray-900">Student ID Cards — Powered by Veducore</h2>
          <p className="mt-2 text-sm text-gray-600 max-w-2xl">
            Veducore designs and prints professional ID cards for your students using data already in your ERP — name, photo, class, admission number, and more. No data entry needed.
          </p>
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3 py-1">
            <CheckCircle className="h-3.5 w-3.5 text-green-600" />
            <span className="text-xs font-medium text-green-700">Data auto-synced from your ERP</span>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <a href={callHref} className={primaryLink}>📞 Call Us</a>
            <a href={emailHref} className={outlineLink}>✉️ Email Us</a>
          </div>
        </Card>

        {/* What's Included */}
        <div>
          <h3 className="text-xl font-bold text-gray-900 mb-4">What's Included</h3>
          <Card className="p-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {includedItems.map((item) => (
                <div key={item.label} className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50">
                    {item.icon}
                  </div>
                  <span className="text-sm font-medium text-gray-700">{item.label}</span>
                </div>
              ))}
            </div>
            <p className="mt-5 text-xs text-gray-500 border-t border-gray-100 pt-4">
              ✅ All this data is already in your Veducore ERP — nothing to fill manually
            </p>
          </Card>
        </div>

        {/* How It Works */}
        <div>
          <h3 className="text-xl font-bold text-gray-900 mb-4">How It Works</h3>
          <Card className="p-6">
            <div className="flex flex-col gap-6 sm:flex-row">
              {steps.map((step) => (
                <div key={step.num} className="flex-1 flex gap-4 items-start">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-white font-bold text-sm">
                    {step.num}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{step.title}</p>
                    <p className="mt-0.5 text-xs text-gray-500">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Apply Form */}
        {!formSubmitted ? (
          <div>
            <h3 className="text-xl font-bold text-gray-900 mb-4">Apply for ID Cards</h3>
            <Card className="p-6">
              <form onSubmit={handleFormSubmit} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">School Name</label>
                    <input
                      type="text"
                      value={formData.schoolName}
                      readOnly
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-600"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Contact Person Name</label>
                    <input
                      type="text"
                      value={formData.contactName}
                      onChange={e => setFormData(f => ({ ...f, contactName: e.target.value }))}
                      placeholder="e.g. Rajesh Kumar"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Contact Phone Number</label>
                    <input
                      type="tel"
                      value={formData.contactPhone}
                      onChange={e => setFormData(f => ({ ...f, contactPhone: e.target.value }))}
                      placeholder="e.g. +91 98765 43210"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
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
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Preferred Delivery Date</label>
                    <input
                      type="date"
                      value={formData.deliveryDate}
                      onChange={e => setFormData(f => ({ ...f, deliveryDate: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Additional Notes / Requirements</label>
                  <textarea
                    value={formData.notes}
                    onChange={e => setFormData(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Any special requirements, custom fields, or notes for the Veducore team..."
                    rows={3}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>
                <div className="pt-2">
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center gap-2 rounded-lg h-10 px-6 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  >
                    Submit Application
                  </button>
                </div>
              </form>
            </Card>
          </div>
        ) : (
          <div>
            <h3 className="text-xl font-bold text-gray-900 mb-4">Apply for ID Cards</h3>
            <Card className="p-6">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-green-100">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Application Submitted!</p>
                  <p className="mt-1 text-sm text-gray-600">Your application has been submitted! The Veducore team will contact you within 24 hours.</p>
                </div>
              </div>
            </Card>
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}
