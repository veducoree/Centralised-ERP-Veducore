/**
 * Mock AuthProvider for local development — bypasses Supabase entirely.
 * Uses the same AuthContext as the real provider, so useAuth() works everywhere.
 * Activated in App.tsx when VITE_MOCK_AUTH=true.
 */

import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Profile, School, Student } from '@/types';
import { MOCK_USERS, MOCK_STUDENTS } from '@/lib/mockData';
import { mockDb } from '@/lib/mockDb';
import { generateParentCredentials } from '@/lib/parentUtils';

// ---- Same shape as real AuthContextValue (superset for mock) ----
interface AuthContextValue {
  session: { access_token: string } | null;
  user: { id: string; email: string } | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (identifier: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  parentChildren: Student[];
}

// Shared context — same object used by real AuthProvider and MockAuthProvider
// so useAuth() from AuthContext.tsx resolves correctly in mock mode too.
export const MockAuthContext = createContext<AuthContextValue | undefined>(undefined);

const STORAGE_KEY = 'mock_auth_user_id';
const PARENT_CHILDREN_KEY = 'mock_auth_parent_children';

export function MockAuthProvider({ children }: { children: ReactNode }) {
  const savedId = sessionStorage.getItem(STORAGE_KEY);
  const savedUser = savedId ? (MOCK_USERS.find(u => u.id === savedId) ?? null) : null;

  const savedChildrenRaw = sessionStorage.getItem(PARENT_CHILDREN_KEY);
  const savedChildren: Student[] = savedChildrenRaw ? (JSON.parse(savedChildrenRaw) as Student[]) : [];

  const [currentUser, setCurrentUser] = useState<typeof MOCK_USERS[0] | null>(savedUser);
  const [parentChildren, setParentChildren] = useState<Student[]>(savedChildren);

  const signIn = async (identifier: string, password: string): Promise<{ error: string | null }> => {
    // Strategy 1: exact email match (admin)
    let found: typeof MOCK_USERS[0] | null = MOCK_USERS.find(
      u => u.email.toLowerCase() === identifier.toLowerCase() && u.password === password
    ) ?? null;

    if (!found && identifier.toLowerCase().endsWith('.veducore')) {
      const prefix = identifier.split('@')[0].toLowerCase();

      // Strategy 2: teacher username — prefix matches first word of teacher's full_name lowercased
      // Apply the same non-alphanumeric strip that generateTeacherUsername uses so names with
      // hyphens, apostrophes, etc. still match (e.g. "O'Brien" → "obrien@...veducore").
      const teacherUser = MOCK_USERS.find(
        u =>
          u.profile.role === 'teacher' &&
          u.profile.full_name.split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '') === prefix
      );
      if (teacherUser && teacherUser.password === password) {
        found = teacherUser;
      }

      // Strategy 3: parent username — prefix is the student's admission number
      if (!found) {
        // Check mockDb first (includes dynamically added students), fall back to MOCK_STUDENTS
        const allStudents = mockDb.getAll<Student>('students');
        // Normalize: strip spaces (matching generateParentCredentials which does replace(/\s+/g, '')).
        // Hyphens and other separators are preserved on both sides, so ADM-2024-001 matches stored ADM-2024-001.
        // Expected admission number format: alphanumeric with optional hyphens, e.g. "ADM-2024-001".
        const normalizedPrefix = prefix.replace(/\s+/g, '');
        const student = allStudents.find(
          s => (s.admission_number ?? '').toLowerCase().replace(/\s+/g, '') === normalizedPrefix
        ) ?? MOCK_STUDENTS.find(
          s => s.admission_number.toLowerCase().replace(/\s+/g, '') === normalizedPrefix
        ) ?? null;

        if (student) {
          // Look up the school name so the password derivation matches what
          // ProfilePage shows (both call generateParentCredentials with schoolName).
          const allSchools = mockDb.getAll<School>('schools');
          const studentSchool = allSchools.find(s => s.id === student.school_id);
          const schoolName = studentSchool?.name ?? 'school';

          const expectedPassword = generateParentCredentials(
            student.full_name,
            student.admission_number ?? '',
            schoolName,
          ).password;

          if (password === expectedPassword) {
            // Build a synthetic parent user from the student's data
            const syntheticProfile: Profile = {
              id: `parent-${student.id}`,
              school_id: student.school_id,
              role: 'parent',
              full_name: student.father_name ?? 'Parent',
              email: student.parent_email ?? identifier,
              phone: null,
              avatar_url: null,
              status: 'active',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            const syntheticUser = {
              id: `parent-${student.id}`,
              email: student.parent_email ?? identifier,
              password: password,
              profile: syntheticProfile,
            };
            found = syntheticUser;

            // Find all siblings (same parent_email + same mother_name, case-insensitive)
            const siblings = allStudents.filter(s => {
              const emailMatch =
                s.parent_email &&
                student.parent_email &&
                s.parent_email.toLowerCase() === student.parent_email.toLowerCase();
              const motherMatch =
                s.mother_name &&
                student.mother_name &&
                s.mother_name.toLowerCase() === student.mother_name.toLowerCase();
              return emailMatch && motherMatch;
            });

            setParentChildren(siblings);
            sessionStorage.setItem(PARENT_CHILDREN_KEY, JSON.stringify(siblings));
          }
        }
      }
    }

    if (!found) return { error: 'Invalid login credentials' };

    // Clear parent children if not a parent login
    if (found.profile.role !== 'parent') {
      setParentChildren([]);
      sessionStorage.removeItem(PARENT_CHILDREN_KEY);
    }

    sessionStorage.setItem(STORAGE_KEY, found.id);
    setCurrentUser(found);
    return { error: null };
  };

  const signOut = async () => {
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(PARENT_CHILDREN_KEY);
    setCurrentUser(null);
    setParentChildren([]);
  };

  const refreshProfile = async () => { /* no-op in mock */ };

  const value: AuthContextValue = {
    session: currentUser ? { access_token: `mock-token-${currentUser.id}` } : null,
    user: currentUser ? { id: currentUser.id, email: currentUser.email } : null,
    profile: currentUser?.profile ?? null,
    loading: false,
    signIn,
    signOut,
    refreshProfile,
    parentChildren,
  };

  return (
    <MockAuthContext.Provider value={value}>
      {children}
    </MockAuthContext.Provider>
  );
}

export function useMockAuth() {
  const ctx = useContext(MockAuthContext);
  if (!ctx) throw new Error('useMockAuth must be used within MockAuthProvider');
  return ctx;
}

/** Hook to get all children visible to the currently logged-in parent. */
export function useParentChildren(): Student[] {
  const ctx = useContext(MockAuthContext);
  return ctx ? (ctx as AuthContextValue).parentChildren : [];
}
