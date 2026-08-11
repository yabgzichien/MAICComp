import { cookies } from 'next/headers';
import Console from './Console';
import AuthGate from './AuthGate';
import { COOKIE_NAME, authMode, hasOfficerSession } from '../lib/officerAuth';

// Reading the session cookie makes this route dynamic, which is what we want: whether to
// serve the console or the sign-in form is a per-request decision, never a cached one.
export const dynamic = 'force-dynamic';

export default function Page() {
  const token = cookies().get(COOKIE_NAME)?.value;
  return (
    <AuthGate initialAuthed={hasOfficerSession(token)} mode={authMode()}>
      <Console />
    </AuthGate>
  );
}
