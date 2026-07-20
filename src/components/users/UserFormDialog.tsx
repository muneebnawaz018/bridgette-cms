'use client';

import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Grid from '@mui/material/Grid2';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import PersonAddRounded from '@mui/icons-material/PersonAddRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import { useSnackbar } from 'notistack';
import { Modal } from '@/components/ui/Modal';
import { PhoneField } from '@/components/ui/PhoneField';
import { FormSection, TextInput, SelectInput, type SelectOption } from '@/components/form/fields';
import { Role } from '@/modules/auth/rbac';
import { UserStatus } from '@/modules/auth/enums';
import { createUserSchema, editUserFormSchema } from '@/modules/auth/schemas';
import { splitPhone, joinPhone, DEFAULT_COUNTRY_ISO2 } from '@/lib/format/countries';
import { apiPost, apiPatch } from '@/lib/api/client';
import { type FieldErrors, toFieldErrors, serverFieldErrors } from '@/lib/form/errors';
import { ROLE_LABEL } from '@/lib/format/labels';

/*
 * One dialog for creating and editing a team member. The two forms were ~90% identical, so a
 * single component with a `user` prop (null = create) keeps them from drifting apart.
 *
 * On typing performance, which is the reason this file looks the way it does:
 *
 * The obvious shape, one `form` object in this component's state, makes every keystroke
 * re-render the whole dialog, MUI's Dialog, Paper, Backdrop and Grow transition included.
 * Worse, React re-commits a controlled input by blanking and restoring its `name` and `type`
 * attributes, so every untouched field still wrote to the DOM. Measured: ~19 DOM mutations
 * per keystroke where 1 was needed, and ~36ms of scripting per keystroke under a 4x CPU
 * throttle.
 *
 * So the typed-in values do not live here. Each input keeps its own value in local state and
 * mirrors it into `valuesRef`, which costs no render at all. This component re-renders only
 * when something structural changes: a role or status pick, a blur that produces an error, or
 * a save. Typing re-renders exactly one input.
 */

/** The fields the dialog needs from the row being edited. */
export interface EditableUser {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  jobTitle?: string;
  notes?: string;
  role: string;
  status: string;
  isProtected?: boolean;
}


const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface FormValues {
  name: string;
  email: string;
  /** Composed E.164 value; the iso2/national pair is what the picker edits. */
  phone: string;
  phoneIso2: string;
  phoneNational: string;
  jobTitle: string;
  notes: string;
  role: '' | Role;
  status: UserStatus;
}

type TextKey = 'name' | 'email' | 'jobTitle' | 'notes';

const EMPTY: FormValues = {
  name: '',
  email: '',
  phone: '',
  phoneIso2: DEFAULT_COUNTRY_ISO2,
  phoneNational: '',
  jobTitle: '',
  notes: '',
  // Create starts with no role so picking one is a deliberate choice, never a default.
  role: '',
  status: UserStatus.Active,
};

/** Build the form values for an existing user. */
function valuesFromUser(user: EditableUser): FormValues {
  // Stored numbers are E.164; the picker needs them back as country + national digits.
  // Recomposing (rather than reusing user.phone) normalizes any legacy local-format number
  // that predates this field, so the form doesn't open on an already-invalid value.
  const { iso2, national } = splitPhone(user.phone);
  return {
    name: user.name,
    email: user.email,
    phone: joinPhone(iso2, national),
    phoneIso2: iso2,
    phoneNational: national,
    jobTitle: user.jobTitle ?? '',
    notes: user.notes ?? '',
    role: (user.role as Role) ?? Role.Accountant,
    status: (user.status as UserStatus) ?? UserStatus.Active,
  };
}

const STATUS_OPTIONS: SelectOption[] = Object.values(UserStatus).map((s) => ({
  value: s,
  label: cap(s),
}));

/**
 * Same idea for the phone picker: the value lives here, not in the dialog. PhoneField itself
 * stays a normal controlled component so it remains reusable elsewhere.
 */
const PhoneInput = memo(function PhoneInput({
  defaultIso2,
  defaultNational,
  error,
  helperText,
  disabled,
  required,
  onChange,
  onBlur,
}: {
  defaultIso2: string;
  defaultNational: string;
  error?: boolean;
  helperText?: string;
  disabled?: boolean;
  required?: boolean;
  onChange: (next: { iso2: string; national: string; e164: string }) => void;
  onBlur: () => void;
}) {
  const [value, setValue] = useState({ iso2: defaultIso2, national: defaultNational });

  const handle = useCallback(
    (next: { iso2: string; national: string; e164: string }) => {
      setValue({ iso2: next.iso2, national: next.national });
      onChange(next);
    },
    [onChange],
  );

  return (
    <PhoneField
      iso2={value.iso2}
      national={value.national}
      onChange={handle}
      onBlur={onBlur}
      error={error}
      helperText={helperText}
      disabled={disabled}
      required={required}
    />
  );
});

export function UserFormDialog({
  open,
  user,
  onClose,
  canCreateAdmin,
  onSaved,
}: {
  open: boolean;
  /** null → create mode; a row → edit mode. */
  user: EditableUser | null;
  onClose: () => void;
  canCreateAdmin: boolean;
  onSaved: () => void;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const isEdit = Boolean(user);

  // Live values. Typing writes here, which costs no render.
  const valuesRef = useRef<FormValues>(EMPTY);
  // Values as of the last open, used for the inputs' defaultValue. Kept separate from the live
  // ref so a keystroke never changes a prop and re-renders a field nobody is typing in.
  const [initial, setInitial] = useState<FormValues>(EMPTY);

  // The selects need a render to show a new pick, so they stay in state. They change rarely.
  const [role, setRole] = useState<'' | Role>('');
  const [status, setStatus] = useState<UserStatus>(UserStatus.Active);

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  // Errors stay hidden until a field is left or the form is submitted, so a blank form never
  // opens covered in red.
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  // Bumped on open so the inputs remount and pick up fresh defaults.
  const [formKey, setFormKey] = useState(0);

  const isEditRef = useRef(isEdit);
  isEditRef.current = isEdit;

  // Reset whenever the dialog opens, or switches to a different user. useLayoutEffect rather
  // than useEffect so the remount lands before paint and no stale value is ever visible.
  useLayoutEffect(() => {
    if (!open) return;
    const next = user ? valuesFromUser(user) : { ...EMPTY };
    valuesRef.current = next;
    setInitial(next);
    setRole(next.role);
    setStatus(next.status);
    setErrors({});
    setTouched({});
    setSubmitted(false);
    setFormKey((k) => k + 1);
  }, [open, user]);

  /** Blank optional fields go as undefined so an empty box never stores "". */
  const buildPayload = useCallback((f: FormValues, edit: boolean) => {
    const shared = {
      name: f.name.trim(),
      phone: f.phone,
      jobTitle: f.jobTitle.trim() || undefined,
      notes: f.notes.trim() || undefined,
    };
    return edit ? shared : { ...shared, email: f.email.trim(), role: f.role || undefined };
  }, []);

  /** Validates with the very same Zod schema the API uses, so the two can never disagree. */
  const validate = useCallback(
    (f: FormValues, edit: boolean): FieldErrors => {
      const schema = edit ? editUserFormSchema : createUserSchema;
      const result = schema.safeParse(buildPayload(f, edit));
      return result.success ? {} : toFieldErrors(result.error);
    },
    [buildPayload],
  );

  const close = useCallback(() => {
    setErrors({});
    setTouched({});
    setSubmitted(false);
    onClose();
  }, [onClose]);

  // --- Handlers below never change identity. That is what lets a memoized input skip
  // rendering when a different field changes. ---

  const setText = useCallback((key: string, value: string) => {
    valuesRef.current[key as TextKey] = value;
  }, []);

  const setPhone = useCallback((next: { iso2: string; national: string; e164: string }) => {
    valuesRef.current.phoneIso2 = next.iso2;
    valuesRef.current.phoneNational = next.national;
    valuesRef.current.phone = next.e164;
  }, []);

  const setSelect = useCallback((key: string, value: string) => {
    if (key === 'role') {
      valuesRef.current.role = value as Role;
      setRole(value as Role);
    } else {
      valuesRef.current.status = value as UserStatus;
      setStatus(value as UserStatus);
    }
  }, []);

  const blurField = useCallback(
    (key: string) => {
      setTouched((t) => (t[key] ? t : { ...t, [key]: true }));
      setErrors(validate(valuesRef.current, isEditRef.current));
    },
    [validate],
  );

  const blurPhone = useCallback(() => blurField('phone'), [blurField]);

  /** A field's error message, or undefined while it should still be hidden. */
  const shown = useCallback(
    (key: string) => (submitted || touched[key] ? errors[key] : undefined),
    [submitted, touched, errors],
  );

  /** Put a failed response's messages onto the fields they belong to. */
  function showFailure(error: string | undefined, details: unknown, fallback: string) {
    const fromServer = serverFieldErrors(details);
    const message = error ?? fallback;
    // Duplicate address and dead-domain checks are server-only rules about the email field.
    if (/already exists|no mail server|disposable/i.test(message)) fromServer.email = message;
    setErrors(fromServer);
    enqueueSnackbar(message, { variant: 'error' });
  }

  async function submit() {
    setSubmitted(true);
    const values = valuesRef.current;
    const found = validate(values, isEdit);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      enqueueSnackbar('Please fix the highlighted fields', { variant: 'warning' });
      return;
    }

    setSaving(true);

    if (isEdit) {
      const body = {
        ...buildPayload(values, true),
        // Role/status are omitted for the protected Super Admin — the server rejects them.
        ...(user!.isProtected ? {} : { role: values.role, status: values.status }),
      };
      const res = await apiPatch(`/api/auth/users/${user!._id}`, body);
      setSaving(false);
      if (!res.ok) return showFailure(res.error, res.details, 'Could not update user');
      enqueueSnackbar('User updated', { variant: 'success' });
      close();
      onSaved();
      return;
    }

    const res = await apiPost<{ emailSent?: boolean; otpTtlMinutes?: number }>(
      '/api/auth/users',
      buildPayload(values, false),
    );
    setSaving(false);
    if (!res.ok) return showFailure(res.error, res.details, 'Failed to create user');

    // The account exists either way; only the invite may have failed. Say which happened
    // rather than reporting a plain success the admin would wrongly trust.
    //
    // On success, name the expiry. The code is short-lived and the admin is the one who has
    // to chase the invitee, so "sent" alone leaves out the part that decides whether they
    // need to resend. The window comes from the server so it stays true if OTP_TTL_MIN moves.
    const failed = res.data?.emailSent === false;
    const ttl = res.data?.otpTtlMinutes;
    enqueueSnackbar(
      failed
        ? 'User created, but the invite email could not be sent'
        : `User created. Verification code sent${ttl ? `, expires in ${ttl} minutes` : ''}.`,
      { variant: failed ? 'warning' : 'success' },
    );
    close();
    onSaved();
  }

  // Administrator first, then Accountant. Admin is only offered to a Super Admin; the current
  // role is prepended in edit mode so the select is never empty.
  const roleOptions = useMemo(() => {
    const options: SelectOption[] = [
      ...(canCreateAdmin ? [{ value: Role.Admin, label: ROLE_LABEL.admin }] : []),
      { value: Role.Accountant, label: ROLE_LABEL.accountant },
    ];
    if (isEdit && role && !options.some((o) => o.value === role)) {
      options.unshift({ value: role, label: ROLE_LABEL[role] ?? role });
    }
    return options;
  }, [canCreateAdmin, isEdit, role]);

  const locked = isEdit && Boolean(user?.isProtected);

  return (
    <Modal
      open={open}
      onClose={close}
      title={isEdit ? `Edit ${user?.name ?? 'user'}` : 'New user'}
      description={
        isEdit ? 'Changes take effect immediately.' : 'They get an email to set a password.'
      }
      icon={isEdit ? <EditRounded /> : <PersonAddRounded />}
      maxWidth="sm"
      busy={saving}
      actions={
        <>
          <Button onClick={close} disabled={saving} variant="outlined" color="inherit">
            Cancel
          </Button>
          {/* No spinner here — the global overlay already covers the request. */}
          <Button variant="contained" onClick={submit} disabled={saving}>
            {isEdit ? 'Save' : 'Create'}
          </Button>
        </>
      }
    >
      <Stack key={formKey} spacing={3}>
        <FormSection title="Basic details">
          <Grid container spacing={2}>
            <Grid size={12}>
              <TextInput
                name="name"
                label="Name"
                defaultValue={initial.name}
                helperText={shown('name')}
                error={Boolean(shown('name'))}
                required
                autoFocus={!isEdit}
                disabled={saving}
                onChange={setText}
                onBlur={blurField}
              />
            </Grid>
            <Grid size={12}>
              {/* Email is the account identity, so it is set once at creation. */}
              <TextInput
                name="email"
                label="Email"
                type="email"
                defaultValue={initial.email}
                helperText={
                  isEdit ? 'Email is the account identity and cannot be changed.' : shown('email')
                }
                error={!isEdit && Boolean(shown('email'))}
                required={!isEdit}
                disabled={saving || isEdit}
                onChange={setText}
                onBlur={blurField}
              />
            </Grid>
            <Grid size={12}>
              <PhoneInput
                defaultIso2={initial.phoneIso2}
                defaultNational={initial.phoneNational}
                helperText={shown('phone')}
                error={Boolean(shown('phone'))}
                required
                disabled={saving}
                onChange={setPhone}
                onBlur={blurPhone}
              />
            </Grid>
          </Grid>
        </FormSection>

        <FormSection title="Role & position">
          <Grid container spacing={2}>
            <Grid size={12}>
              <SelectInput
                name="role"
                label="Role"
                value={role}
                options={roleOptions}
                placeholderLabel={isEdit ? undefined : 'Select a role'}
                helperText={locked ? 'Protected user role cannot be changed.' : shown('role')}
                error={!locked && Boolean(shown('role'))}
                required
                disabled={saving || locked}
                onChange={setSelect}
                onBlur={blurField}
              />
            </Grid>

            {/* Status only exists for an account that already exists. */}
            {isEdit && (
              <Grid size={12}>
                <SelectInput
                  name="status"
                  label="Status"
                  value={status}
                  options={STATUS_OPTIONS}
                  disabled={saving || locked}
                  onChange={setSelect}
                  onBlur={blurField}
                />
              </Grid>
            )}

            <Grid size={12}>
              <TextInput
                name="jobTitle"
                label="Job title"
                defaultValue={initial.jobTitle}
                helperText={shown('jobTitle')}
                error={Boolean(shown('jobTitle'))}
                disabled={saving}
                placeholder="e.g. Office Manager"
                onChange={setText}
                onBlur={blurField}
              />
            </Grid>
          </Grid>
        </FormSection>

        <FormSection title="Internal notes">
          <TextInput
            name="notes"
            label="Notes"
            defaultValue={initial.notes}
            helperText={shown('notes')}
            error={Boolean(shown('notes'))}
            disabled={saving}
            multiline
            minRows={2}
            placeholder="Only visible to admins"
            onChange={setText}
            onBlur={blurField}
          />
        </FormSection>
      </Stack>
    </Modal>
  );
}
