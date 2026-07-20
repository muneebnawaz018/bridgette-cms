'use client';

import { Suspense, useCallback, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { z } from 'zod';
import Stack from '@mui/material/Stack';
import { useSnackbar } from 'notistack';
import { AuthCard } from '@/components/auth/AuthCard';
import { TextInput } from '@/components/form/fields';
import { PasswordField } from '@/components/form/PasswordField';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { BrandLoader } from '@/components/ui/BrandLoader';
import { setPasswordSchema } from '@/modules/auth/schemas';
import { apiPost } from '@/lib/api/client';
import { type FieldErrors, toFieldErrors, serverFieldErrors } from '@/lib/form/errors';

/*
 * Onboarding form, validated the same way the user and invoice dialogs are: the API's own Zod
 * schema decides what is valid, errors land under the field they belong to, and a field stays
 * quiet until it has been visited or the form has been submitted once.
 *
 * Previously every failure — a short password, a mistyped confirmation, a wrong code — arrived
 * as a single toast that named no field. On a four-field form where two of them are masked,
 * that left people guessing which input to fix.
 */

/** The API schema plus the confirmation box, which only exists on the client. */
const setPasswordFormSchema = setPasswordSchema
  .extend({ confirm: z.string().min(1, 'Re-enter your password') })
  .refine((v) => v.password === v.confirm, {
    message: 'Passwords do not match',
    // Without an explicit path a refine attaches to the object root and renders nowhere.
    path: ['confirm'],
  });

interface FormValues {
  email: string;
  code: string;
  password: string;
  confirm: string;
}

function SetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { enqueueSnackbar } = useSnackbar();

  // The invite links here with ?email=, so the address is usually already known.
  const initialEmail = params.get('email') ?? '';

  // Values live in a ref: typing then costs no render, matching how the user dialog works.
  // Nothing here re-renders on keystroke — only on blur that changes an error, or on submit.
  const valuesRef = useRef<FormValues>({ email: initialEmail, code: '', password: '', confirm: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const validate = useCallback((): FieldErrors => {
    const result = setPasswordFormSchema.safeParse(valuesRef.current);
    return result.success ? {} : toFieldErrors(result.error);
  }, []);

  const setField = useCallback((name: string, value: string) => {
    valuesRef.current[name as keyof FormValues] = value;
  }, []);

  const blurField = useCallback(
    (name: string) => {
      setTouched((t) => (t[name] ? t : { ...t, [name]: true }));
      setErrors(validate());
    },
    [validate],
  );

  /** A field's message, or undefined while it should still stay hidden. */
  const shown = useCallback(
    (name: string) => (submitted || touched[name] ? errors[name] : undefined),
    [submitted, touched, errors],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      enqueueSnackbar('Please fix the highlighted fields', { variant: 'warning' });
      return;
    }

    setLoading(true);
    const { email, code, password } = valuesRef.current;
    const res = await apiPost('/api/auth/verify', { email, code, password });

    if (!res.ok) {
      setLoading(false);
      const message = res.error ?? 'Verification failed';
      const fromServer = serverFieldErrors(res.details);
      // A bad or expired code is a server-only rule about the code box — the client cannot
      // know it, and it is the single most likely failure here, so point straight at it.
      if (/code/i.test(message)) fromServer.code = message;
      setErrors(fromServer);
      enqueueSnackbar(message, { variant: 'error' });
      return;
    }

    enqueueSnackbar('Password set. You can sign in now.', { variant: 'success' });
    // Stays true so the global overlay covers the trip to the login page instead of leaving
    // this form on screen looking idle. Unmounting on arrival releases it.
    router.replace('/login');
    window.setTimeout(() => setLoading(false), 10_000);
  }

  return (
    <form onSubmit={submit} noValidate>
      <Stack spacing={2}>
        <TextInput
          name="email"
          label="Email"
          type="email"
          defaultValue={initialEmail}
          onChange={setField}
          onBlur={blurField}
          error={Boolean(shown('email'))}
          helperText={shown('email')}
          required
          disabled={loading}
        />
        <TextInput
          name="code"
          label="Verification code"
          defaultValue=""
          onChange={setField}
          onBlur={blurField}
          error={Boolean(shown('code'))}
          helperText={shown('code')}
          required
          disabled={loading}
          autoFocus={Boolean(initialEmail)}
        />
        <PasswordField
          label="New password"
          name="password"
          defaultValue=""
          onChange={(e) => setField('password', e.target.value)}
          onBlur={() => blurField('password')}
          error={Boolean(shown('password'))}
          // Falls back to the rule itself, so the requirement is visible before it is broken.
          helperText={shown('password') ?? 'At least 8 characters'}
          required
          fullWidth
          disabled={loading}
        />
        <PasswordField
          label="Confirm password"
          name="confirm"
          defaultValue=""
          onChange={(e) => setField('confirm', e.target.value)}
          onBlur={() => blurField('confirm')}
          error={Boolean(shown('confirm'))}
          helperText={shown('confirm')}
          required
          fullWidth
          disabled={loading}
        />
        <SubmitButton type="submit" variant="contained" size="large" loading={loading} fullWidth>
          {loading ? 'Saving…' : 'Set password'}
        </SubmitButton>
      </Stack>
    </form>
  );
}

export default function SetPasswordPage() {
  return (
    <AuthCard title="Verify your account" subtitle="Enter the code we emailed you and choose a password">
      <Suspense fallback={<BrandLoader label="Loading…" />}>
        <SetPasswordForm />
      </Suspense>
    </AuthCard>
  );
}
