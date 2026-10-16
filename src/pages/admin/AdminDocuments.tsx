import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, CheckCircle, ScrollText, Award, User,
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

export default function AdminDocuments() {
  const navigate = useNavigate();

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
          <div className="mt-5">
            <button
              onClick={() => navigate('/admin/documents/generate')}
              className="inline-flex items-center justify-center gap-2 rounded-lg h-10 px-5 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            >
              <FileText className="h-4 w-4" />
              Generate Document
            </button>
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
      </div>
    </DashboardLayout>
  );
}
