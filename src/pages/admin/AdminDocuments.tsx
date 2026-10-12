import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, Lock, CheckCircle, ScrollText, Award, User,
  BookOpen, Hash, Calendar, Building2, Phone, Printer,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';

const primaryLink =
  'inline-flex items-center justify-center gap-2 rounded-lg h-10 px-4 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/40';
const outlineLink =
  'inline-flex items-center justify-center gap-2 rounded-lg h-10 px-4 text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/40';

const docTypes = [
  {
    icon: <ScrollText className="h-6 w-6 text-blue-600" />,
    title: 'Bonafide Certificate',
    desc: 'Confirms the student is currently enrolled in the school.',
  },
  {
    icon: <FileText className="h-6 w-6 text-blue-600" />,
    title: 'Transfer Certificate (TC)',
    desc: 'Issued when a student leaves the school for another institution.',
  },
  {
    icon: <Award className="h-6 w-6 text-blue-600" />,
    title: 'Character Certificate',
    desc: 'Attests the good conduct and character of the student.',
  },
  {
    icon: <Printer className="h-6 w-6 text-blue-600" />,
    title: 'Fee Receipt / No-Dues',
    desc: 'Certifies that all fee dues have been cleared by the student.',
  },
];

const includedItems = [
  { icon: <User className="h-5 w-5 text-blue-600" />, label: 'Student Full Name' },
  { icon: <Hash className="h-5 w-5 text-blue-600" />, label: 'Admission Number' },
  { icon: <BookOpen className="h-5 w-5 text-blue-600" />, label: 'Class & Section' },
  { icon: <Calendar className="h-5 w-5 text-blue-600" />, label: 'Date of Birth' },
  { icon: <User className="h-5 w-5 text-blue-600" />, label: "Father's Name" },
  { icon: <Building2 className="h-5 w-5 text-blue-600" />, label: 'School Name & Logo' },
  { icon: <Phone className="h-5 w-5 text-blue-600" />, label: 'School Address & Contact' },
  { icon: <Calendar className="h-5 w-5 text-blue-600" />, label: 'Academic Year' },
];

const steps = [
  {
    num: 1,
    title: 'Select document type and enter student details',
    desc: 'Choose the certificate type and pick the student from your ERP list.',
  },
  {
    num: 2,
    title: 'Preview on school letterhead with all data pre-filled',
    desc: 'Student details are auto-populated — no manual typing needed.',
  },
  {
    num: 3,
    title: 'Print or export as PDF — ready to sign and stamp',
    desc: 'Get a print-ready document on A4 with your school letterhead space.',
  },
];

export default function AdminDocuments() {
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const [credential, setCredential] = useState('');
  const [credError, setCredError] = useState('');

  function handleAccess() {
    if (credential === 'veducore.staff.documents') {
      navigate('/admin/documents/generate');
    } else {
      setCredError('Invalid credential');
    }
  }

  function handleCancel() {
    setShowModal(false);
    setCredential('');
    setCredError('');
  }

  return (
    <DashboardLayout title="Documents">
      <div className="space-y-8">
        {/* Hero */}
        <Card className="p-6 sm:p-8">
          <h2 className="text-2xl font-bold text-gray-900">School Documents — Powered by Veducore</h2>
          <p className="mt-2 text-sm text-gray-600 max-w-2xl">
            Issue official school documents on your letterhead — bonafide certificates, transfer certificates,
            character certificates, fee receipts, and more — with student data pulled directly from your ERP.
          </p>
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3 py-1">
            <CheckCircle className="h-3.5 w-3.5 text-green-600" />
            <span className="text-xs font-medium text-green-700">School letterhead auto-applied</span>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <a href="tel:+919999999999" className={primaryLink}>📞 Call Us</a>
            <a href="mailto:documents@veducore.com" className={outlineLink}>✉️ Email Us</a>
          </div>
        </Card>

        {/* Document Types */}
        <div>
          <h3 className="text-xl font-bold text-gray-900 mb-4">Document Types Available</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {docTypes.map((dt) => (
              <Card key={dt.title} className="p-5 flex flex-col gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                  {dt.icon}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{dt.title}</p>
                  <p className="mt-1 text-xs text-gray-500">{dt.desc}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* What's Included */}
        <div>
          <h3 className="text-xl font-bold text-gray-900 mb-4">What's Included on Every Document</h3>
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
              ✅ All data pulled from your Veducore ERP automatically
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

        {/* Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white max-w-sm w-full mx-4 p-6 rounded-xl shadow-xl">
              <h2 className="text-lg font-semibold text-gray-900">Staff Access</h2>
              <p className="mt-1 text-sm text-gray-500">
                Enter your Veducore staff credential to access the document generator.
              </p>
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Staff Credential</label>
                <input
                  type="password"
                  value={credential}
                  onChange={e => { setCredential(e.target.value); setCredError(''); }}
                  onKeyDown={e => { if (e.key === 'Enter') handleAccess(); }}
                  placeholder="Enter credential"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
                {credError && <p className="mt-1 text-sm text-red-500">{credError}</p>}
              </div>
              <div className="mt-4 flex gap-2 justify-end">
                <button
                  onClick={handleCancel}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAccess}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                >
                  Access
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Staff Access button */}
      <div className="mt-8 flex justify-center">
        <button
          onClick={() => setShowModal(true)}
          className="border border-slate-300 text-slate-400 hover:text-slate-600 hover:border-slate-400 bg-transparent text-xs px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors"
        >
          <Lock className="h-3 w-3" />
          Veducore Staff Access
        </button>
      </div>
    </DashboardLayout>
  );
}
