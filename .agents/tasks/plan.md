# Implementation Plan — Mock to Supabase Production Migration

> Codebase: /Users/aryansinghthakur/Downloads/Veducore
> Build command: `npm run build` (inside workspace root)
> TypeScript check: `npm run typecheck` → `npx tsc --noEmit -p tsconfig.app.json`

---

- [ ] 1. Write the Supabase migration file for missing tables and columns.
      Create `supabase/migrations/20261022000000_005_missing_tables_and_columns.sql` with:
      - `ALTER TABLE students ADD COLUMN IF NOT EXISTS father_name text, ADD COLUMN IF NOT EXISTS mother_name text, ADD COLUMN IF NOT EXISTS parent_email text;`
      - `CREATE TABLE IF NOT EXISTS holidays (id uuid PK, school_id uuid FK→schools, date date NOT NULL, type text CHECK IN ('working','holiday','festival'), label text, created_at, updated_at, UNIQUE(school_id, date))` + RLS (admin full CRUD, teacher/parent SELECT own school) + `set_updated_at` trigger
      - `CREATE TABLE IF NOT EXISTS exam_defs (id uuid PK, school_id uuid FK→schools, section_id uuid FK→sections, exam_name text, record_type text, max_marks numeric, date date, created_by_teacher_id uuid FK→teachers, created_at, updated_at)` + RLS (admin full, teacher INSERT/SELECT own section, parent SELECT own children's section) + trigger
      - `CREATE TABLE IF NOT EXISTS fee_structures (id uuid PK, school_id uuid FK→schools, name text, fee_type text, class_id uuid FK→classes nullable, amount numeric, frequency text CHECK IN ('one_time','monthly','quarterly','annual'), due_day int, academic_year text, is_active boolean DEFAULT true, created_at, updated_at, UNIQUE(school_id, name, academic_year))` + RLS (admin full CRUD) + trigger
      - `CREATE TABLE IF NOT EXISTS payment_setups (id uuid PK, school_id uuid UNIQUE FK→schools, razorpay_key_id text, account_holder_name text, bank_name text, account_number text, ifsc_code text, is_verified boolean DEFAULT false, created_at, updated_at)` + RLS (admin full CRUD) + trigger
      - Teacher insert/update policies on students table (teachers can insert and update students in their assigned sections)
      Files: `supabase/migrations/20261022000000_005_missing_tables_and_columns.sql`
      Verify: `cd /Users/aryansinghthakur/Downloads/Veducore && npx tsc --noEmit -p tsconfig.app.json` — must still pass (migration is SQL only, no TS impact at this step).

- [ ] 2. Add the `Holiday` interface to `src/types/index.ts`.
      The `types/index.ts` already has `ExamDef`, `FeeStructure`, `PaymentSetup` but is missing `Holiday`. Add:
      ```ts
      export interface Holiday {
        id: string;
        school_id: string;
        date: string;           // YYYY-MM-DD
        type: 'working' | 'holiday' | 'festival';
        label: string | null;
        created_at: string;
        updated_at: string;
      }
      ```
      Files: `src/types/index.ts`
      Verify: `npm run typecheck` — no new errors.

- [ ] 3. Add missing API functions to `src/services/realApi.ts`.
      Append eight new exported async functions after the existing exports. Import `Holiday`, `ExamDef`, `FeeStructure`, `PaymentSetup` from `@/types` at the top of the file (add to existing import line).
      Functions to add:
      - `fetchHolidays(schoolId: string): Promise<Holiday[]>` — SELECT * from holidays WHERE school_id = schoolId ORDER BY date
      - `createHoliday(holiday: {school_id:string; date:string; type:string; label?:string}): Promise<Holiday|null>`
      - `updateHoliday(id: string, updates: Partial<Holiday>): Promise<Holiday|null>`
      - `deleteHoliday(id: string): Promise<void>`
      - `fetchExamDefs(filters: {schoolId?:string; sectionId?:string}): Promise<ExamDef[]>`
      - `createExamDef(def: Omit<ExamDef,'id'|'created_at'|'updated_at'>): Promise<ExamDef|null>`
      - `deleteExamDef(id: string): Promise<void>`
      - `fetchFeeStructures(schoolId: string): Promise<FeeStructure[]>`
      - `createFeeStructure(fs: Omit<FeeStructure,'id'|'created_at'|'updated_at'>): Promise<FeeStructure|null>`
      - `updateFeeStructure(id: string, updates: Partial<FeeStructure>): Promise<FeeStructure|null>`
      - `deleteFeeStructure(id: string): Promise<void>`
      - `fetchPaymentSetup(schoolId: string): Promise<PaymentSetup|null>` — SELECT * WHERE school_id = schoolId maybeSingle
      - `upsertPaymentSetup(setup: Omit<PaymentSetup,'id'|'created_at'|'updated_at'>): Promise<PaymentSetup|null>` — upsert on conflict school_id
      Files: `src/services/realApi.ts`
      Verify: `npm run typecheck` — no new errors.

- [ ] 4. Simplify `src/services/api.ts` — remove mock toggle, export everything from realApi directly.
      Replace entire file content with direct re-exports from `./realApi` (no mock import, no isMock conditional). Add re-exports for all new functions added in step 3:
      `fetchHolidays`, `createHoliday`, `updateHoliday`, `deleteHoliday`, `fetchExamDefs`, `createExamDef`, `deleteExamDef`, `fetchFeeStructures`, `createFeeStructure`, `updateFeeStructure`, `deleteFeeStructure`, `fetchPaymentSetup`, `upsertPaymentSetup`.
      Files: `src/services/api.ts`
      Verify: `npm run typecheck` — no errors.

- [ ] 5. Remove mock infrastructure files.
      Delete the following three files entirely:
      - `src/auth/MockAuthContext.tsx`
      - `src/lib/mockData.ts`
      - `src/lib/mockDb.ts`
      - `src/services/mockApi.ts`
      Files: deleted
      Verify: `npm run typecheck` — will surface import errors that steps 6-9 fix. Expect errors at this point.

- [ ] 6. Fix `src/auth/AuthContext.tsx` — remove MockAuthContext dependency.
      - Remove `import { MockAuthContext } from './MockAuthContext'`
      - Simplify `useAuth()` to only use `AuthContext`: `const ctx = useContext(AuthContext); if (!ctx) throw new Error('useAuth must be used within AuthProvider');`
      - Remove the `mockCtx` variable entirely.
      Files: `src/auth/AuthContext.tsx`
      Verify: `npm run typecheck` — AuthContext errors resolved.

- [ ] 7. Fix `src/App.tsx` — remove MockAuthProvider, always use AuthProvider.
      - Remove `import { MockAuthProvider } from '@/auth/MockAuthContext'`
      - Remove `const isMockAuth = ...` and `const ActiveAuthProvider = ...`
      - Replace `<ActiveAuthProvider>` with `<AuthProvider>` in JSX
      Files: `src/App.tsx`
      Verify: `npm run typecheck` — App errors resolved.

- [ ] 8. Fix `src/pages/admin/AdminParents.tsx` — remove mockDb dependency.
      - Remove `import { mockDb } from '@/lib/mockDb'` and `const isMock = import.meta.env.VITE_MOCK_AUTH === 'true'`
      - Remove the `MockParentsView` component and all mock-only JSX
      - The file renders `isMock ? <MockParentsView /> : <AdminParentsRealView />` — remove the ternary and render `<AdminParentsRealView />` directly
      - The `MockParentsView` component uses `mockDb.getAll` and `getParentGroups` — those usages are deleted with it. Keep the `getParentGroups` import if it is still used elsewhere in the file; otherwise remove it too.
      Files: `src/pages/admin/AdminParents.tsx`
      Verify: `npm run typecheck` — AdminParents errors resolved.

- [ ] 9. Fix `src/pages/admin/AdminIDCardGenerator.tsx` — replace MOCK_SCHOOL with real school data.
      - Remove `import { MOCK_SCHOOL } from '@/lib/mockData'`
      - Add `useAuth` import (already imported transitively, but add if needed) and `fetchSchool` from `@/services/api`
      - Add a `school` state (`useState<School|null>(null)`) and a `useEffect` to fetch `fetchSchool(profile.school_id)` alongside the existing student fetch
      - Replace every reference to `MOCK_SCHOOL.name` with `school?.name ?? 'School'`
      Files: `src/pages/admin/AdminIDCardGenerator.tsx`
      Verify: `npm run typecheck` — IDCardGenerator errors resolved.

- [ ] 10. Fix `src/pages/shared/ProfilePage.tsx` — replace `useParentChildren` from MockAuthContext.
      `useParentChildren()` currently reads from `MockAuthContext`. In real mode, the parent's linked children come from `fetchParentStudents(parentId)` via the API.
      - Remove `import { useParentChildren } from '@/auth/MockAuthContext'`
      - Add state: `const [parentChildren, setParentChildren] = useState<Student[]>([])`
      - In the existing `useEffect`, when `profile.role === 'parent'`, call `fetchParentStudents(profile.id)` and map the result to extract the `student` field into `parentChildren` state
      - `fetchParentStudents` is already exported from `@/services/api`; add it to the import
      - The password change logic for parents (which uses `parentChildren`) stays structurally the same — it just now reads from real data
      Files: `src/pages/shared/ProfilePage.tsx`
      Verify: `npm run typecheck` — ProfilePage errors resolved.

- [ ] 11. Set `VITE_MOCK_AUTH=false` in `.env`.
      Change the line `VITE_MOCK_AUTH=true` to `VITE_MOCK_AUTH=false`.
      Files: `.env`
      Verify: `npm run typecheck` — full clean pass with zero errors (there is one pre-existing error in `src/pages/parent/ParentFees.tsx` that should also be fixed: the `FeeStatus` type comparison on line 56 — change the comparison value from `'paid'` to match the union correctly, or widen the local status type to include `'paid'`).

- [ ] 12. Create the mobile Supabase client at `app/src/lib/supabase.ts`.
      The mobile app already has `app/src/lib/` with `mockData.ts`, `mockDb.ts`, `notifications.ts`, and `utils.ts`. Create a new file:
      ```ts
      import AsyncStorage from '@react-native-async-storage/async-storage';
      import { createClient } from '@supabase/supabase-js';

      const SUPABASE_URL = 'https://cdxvtpelytopdunvwvvl.supabase.co';
      const SUPABASE_ANON_KEY = 'eyJhbGci...'; // full key from .env

      export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      });
      ```
      NOTE: `@supabase/supabase-js` is NOT in `app/package.json`. Before this file can be used, run inside `app/`:
      `npm install @supabase/supabase-js@2.57.4`
      (pin to the same version used by the web app)
      Files: `app/src/lib/supabase.ts`
      Verify: `cd app && npx tsc --noEmit` — file compiles without errors (after the npm install).

- [ ] 13. Final TypeScript clean pass.
      Run `npm run typecheck` from the workspace root. Fix any remaining errors not caught in earlier steps.
      Files: whatever the compiler flags
      Verify: `npx tsc --noEmit -p tsconfig.app.json` exits with code 0 and zero output.
