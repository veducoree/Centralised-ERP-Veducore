import type { MockUser, School, Teacher, Parent, Student, Class, Section, Subject } from '@/types';

export const MOCK_SCHOOL_ID = 'school-001';

export const MOCK_SCHOOL: School = {
  id: MOCK_SCHOOL_ID,
  name: 'Greenwood International School',
  logo_url: null,
  address: '123 Education Lane, Mumbai, MH 400001',
  contact_number: '+91-22-1234-5678',
  email: 'admin@greenwood.edu',
  academic_year: '2026-2027',
  timezone: 'Asia/Kolkata',
  currency: 'INR',
  currency_symbol: '₹',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

export const MOCK_USERS: MockUser[] = [
  {
    id: 'user-admin-001',
    email: 'iamaryan721@gmail.com',
    password: 'aryan3860',
    profile: {
      id: 'user-admin-001',
      school_id: MOCK_SCHOOL_ID,
      role: 'admin',
      full_name: 'Aryan Singh Thakur',
      email: 'iamaryan721@gmail.com',
      phone: '+91-9876543210',
      avatar_url: null,
      status: 'active',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  },
  {
    id: 'user-teacher-001',
    email: 'teacher1@greenwood.edu',
    password: 'Teacher@123',
    profile: {
      id: 'user-teacher-001',
      school_id: MOCK_SCHOOL_ID,
      role: 'teacher',
      full_name: 'Priya Sharma',
      email: 'teacher1@greenwood.edu',
      phone: '+91-9876543211',
      avatar_url: null,
      status: 'active',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  },
  {
    id: 'user-parent-001',
    email: 'parent1@greenwood.edu',
    password: 'Parent@123',
    profile: {
      id: 'user-parent-001',
      school_id: MOCK_SCHOOL_ID,
      role: 'parent',
      full_name: 'Ramesh Verma',
      email: 'parent1@greenwood.edu',
      phone: '+91-9876543212',
      avatar_url: null,
      status: 'active',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  },
];

export const MOCK_CLASSES: Class[] = [
  { id: 'class-001', school_id: MOCK_SCHOOL_ID, name: 'Class 1', grade_level: 1, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  { id: 'class-002', school_id: MOCK_SCHOOL_ID, name: 'Class 2', grade_level: 2, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  { id: 'class-003', school_id: MOCK_SCHOOL_ID, name: 'Class 5', grade_level: 5, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  { id: 'class-004', school_id: MOCK_SCHOOL_ID, name: 'Class 8', grade_level: 8, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  { id: 'class-005', school_id: MOCK_SCHOOL_ID, name: 'Class 10', grade_level: 10, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
];

export const MOCK_SECTIONS: Section[] = [
  { id: 'sec-001', school_id: MOCK_SCHOOL_ID, class_id: 'class-001', name: 'A', capacity: 40, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  { id: 'sec-002', school_id: MOCK_SCHOOL_ID, class_id: 'class-001', name: 'B', capacity: 40, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  { id: 'sec-003', school_id: MOCK_SCHOOL_ID, class_id: 'class-003', name: 'A', capacity: 40, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  { id: 'sec-004', school_id: MOCK_SCHOOL_ID, class_id: 'class-004', name: 'A', capacity: 38, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  { id: 'sec-005', school_id: MOCK_SCHOOL_ID, class_id: 'class-005', name: 'A', capacity: 35, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
];

export const MOCK_SUBJECTS: Subject[] = [
  { id: 'sub-001', school_id: MOCK_SCHOOL_ID, name: 'Mathematics', code: 'MATH', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  { id: 'sub-002', school_id: MOCK_SCHOOL_ID, name: 'Science', code: 'SCI', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  { id: 'sub-003', school_id: MOCK_SCHOOL_ID, name: 'English', code: 'ENG', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  { id: 'sub-004', school_id: MOCK_SCHOOL_ID, name: 'Hindi', code: 'HIN', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  { id: 'sub-005', school_id: MOCK_SCHOOL_ID, name: 'Social Studies', code: 'SST', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  { id: 'sub-006', school_id: MOCK_SCHOOL_ID, name: 'Computer Science', code: 'CS', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
];

export const MOCK_TEACHERS: Teacher[] = [
  { id: 'teacher-001', school_id: MOCK_SCHOOL_ID, user_id: 'user-teacher-001', full_name: 'Priya Sharma', email: 'teacher1@greenwood.edu', password: 'Teacher@123', phone: '+91-9876543211', employee_id: 'EMP-001', qualification: 'M.Sc Mathematics', subject: 'Mathematics', date_of_joining: '2022-06-01', avatar_url: null, status: 'active', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  { id: 'teacher-002', school_id: MOCK_SCHOOL_ID, user_id: null, full_name: 'Rahul Mehta', email: 'teacher2@greenwood.edu', password: 'Teacher@123', phone: '+91-9876543213', employee_id: 'EMP-002', qualification: 'M.Sc Physics', subject: 'Science', date_of_joining: '2021-07-15', avatar_url: null, status: 'active', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  { id: 'teacher-003', school_id: MOCK_SCHOOL_ID, user_id: null, full_name: 'Anita Desai', email: 'teacher3@greenwood.edu', password: 'Teacher@123', phone: '+91-9876543214', employee_id: 'EMP-003', qualification: 'MA English', subject: 'English', date_of_joining: '2023-04-01', avatar_url: null, status: 'active', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  { id: 'teacher-004', school_id: MOCK_SCHOOL_ID, user_id: null, full_name: 'Suresh Kumar', email: 'teacher4@greenwood.edu', password: 'Teacher@123', phone: '+91-9876543215', employee_id: 'EMP-004', qualification: 'B.Tech Computer Science', subject: 'Computer Science', date_of_joining: '2024-01-10', avatar_url: null, status: 'inactive', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
];

export const MOCK_PARENTS: Parent[] = [
  { id: 'parent-001', school_id: MOCK_SCHOOL_ID, user_id: 'user-parent-001', full_name: 'Ramesh Verma', email: 'parent1@greenwood.edu', phone: '+91-9876543212', occupation: 'Engineer', address: '45 Park Street, Mumbai', avatar_url: null, status: 'active', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  { id: 'parent-002', school_id: MOCK_SCHOOL_ID, user_id: null, full_name: 'Sunita Patel', email: 'parent2@greenwood.edu', phone: '+91-9876543216', occupation: 'Doctor', address: '78 MG Road, Pune', avatar_url: null, status: 'active', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  { id: 'parent-003', school_id: MOCK_SCHOOL_ID, user_id: null, full_name: 'Vikram Joshi', email: 'parent3@greenwood.edu', phone: '+91-9876543217', occupation: 'Business Owner', address: '12 Lakeview Colony, Nashik', avatar_url: null, status: 'active', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
];

export const MOCK_STUDENTS: Student[] = [
  { id: 'student-001', school_id: MOCK_SCHOOL_ID, admission_number: 'ADM-2024-001', full_name: 'Aakash Verma', father_name: 'Ramesh Verma', mother_name: 'Sunita Verma', parent_email: 'verma.family@example.com', date_of_birth: '2018-03-15', gender: 'male', class_id: 'class-001', section_id: 'sec-001', roll_number: 1, address: '45 Park Street, Mumbai', admission_date: '2024-04-01', avatar_url: null, status: 'active', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', class: MOCK_CLASSES[0], section: MOCK_SECTIONS[0] },
  { id: 'student-002', school_id: MOCK_SCHOOL_ID, admission_number: 'ADM-2024-002', full_name: 'Riya Patel', father_name: 'Vikram Patel', mother_name: 'Anjali Patel', parent_email: 'patel.family@example.com', date_of_birth: '2017-07-22', gender: 'female', class_id: 'class-003', section_id: 'sec-003', roll_number: 5, address: '78 MG Road, Pune', admission_date: '2024-04-01', avatar_url: null, status: 'active', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', class: MOCK_CLASSES[2], section: MOCK_SECTIONS[2] },
  { id: 'student-003', school_id: MOCK_SCHOOL_ID, admission_number: 'ADM-2023-015', full_name: 'Arjun Sharma', father_name: 'Deepak Sharma', mother_name: 'Pooja Sharma', parent_email: 'sharma.family@example.com', date_of_birth: '2014-11-08', gender: 'male', class_id: 'class-004', section_id: 'sec-004', roll_number: 12, address: '23 Civil Lines, Delhi', admission_date: '2023-04-01', avatar_url: null, status: 'active', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', class: MOCK_CLASSES[3], section: MOCK_SECTIONS[3] },
  { id: 'student-004', school_id: MOCK_SCHOOL_ID, admission_number: 'ADM-2022-008', full_name: 'Meera Joshi', father_name: 'Vikram Joshi', mother_name: 'Kavita Joshi', parent_email: 'joshi.family@example.com', date_of_birth: '2012-05-30', gender: 'female', class_id: 'class-005', section_id: 'sec-005', roll_number: 8, address: '12 Lakeview Colony, Nashik', admission_date: '2022-04-01', avatar_url: null, status: 'active', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', class: MOCK_CLASSES[4], section: MOCK_SECTIONS[4] },
  { id: 'student-005', school_id: MOCK_SCHOOL_ID, admission_number: 'ADM-2024-003', full_name: 'Kabir Singh', father_name: 'Harjinder Singh', mother_name: 'Harpreet Singh', parent_email: 'singh.family@example.com', date_of_birth: '2018-09-12', gender: 'male', class_id: 'class-001', section_id: 'sec-001', roll_number: 2, address: '56 Andheri West, Mumbai', admission_date: '2024-04-01', avatar_url: null, status: 'active', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', class: MOCK_CLASSES[0], section: MOCK_SECTIONS[0] },
  { id: 'student-006', school_id: MOCK_SCHOOL_ID, admission_number: 'ADM-2022-006', full_name: 'Neha Verma', father_name: 'Ramesh Verma', mother_name: 'Sunita Verma', parent_email: 'verma.family@example.com', date_of_birth: '2016-08-20', gender: 'female', class_id: 'class-003', section_id: 'sec-003', roll_number: 15, address: '45 Park Street, Mumbai', admission_date: '2022-04-01', avatar_url: null, status: 'active', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', class: MOCK_CLASSES[2], section: MOCK_SECTIONS[2] },
];
