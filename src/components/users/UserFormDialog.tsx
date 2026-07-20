'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid2';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import PersonAddRounded from '@mui/icons-material/PersonAddRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import { useSnackbar } from 'notistack';
import { Modal } from '@/components/ui/Modal';
import { PhoneField } from '@/components/ui/PhoneField';
import { Role } from '@/modules/auth/rbac';
import { UserStatus } from '@/modules/auth/enums';
import { createUserSchema, editUserFormSchema } from '@/modules/auth/schemas';
import { splitPhone, joinPhone, DEFAULT_COUNTRY_ISO2 } from '@/lib/format/countries';
import { apiPost, apiPatch } from '@/lib/api/client';
import { type FieldErrors, toFieldErrors, serverFieldErrors } from '@/lib/form/errors';

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

const ROLE_LABEL: Record<string, string> = {
  superAdmin: 'Super Admin',
  admin: 'Administrator',
  accountant: 'Accountant / Manager',
  sales: 'Sales',
  readOnly: 'Read only',
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface FormState {
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
type SelectKey = 'role' | 'status';

const EMPTY: FormState = {
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

/** Build the form state for an existing user. */
function stateFromUser(user: EditableUser): FormState {
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

/** Hoisted so they are not rebuilt (and re-serialized by emotion) on every render. */
const SHRINK_LABEL = { shrink: true } as const;
const DISPLAY_EMPTY = { displayEmpty: true } as const;
const STATUS_OPTIONS = Object.values(UserStatus).map((s) => ({ value: s, label: cap(s) }));

/** A labelled group of fields, so the form reads as a profile rather than a loose stack. */
const FormSection = memo(function FormSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Box>
      <Typography
        variant="overline"
        sx={{
          display: 'block',
          color: 'text.secondary',
          fontWeight: 700,
          letterSpacing: '0.08em',
          mb: 1,
        }}
      >
        {title}
      </Typography>
      {children}
    </Box>
  );
});

/**
 * A single text input. Every prop is a primitive except the two callbacks, which are stable
 * for the dialog's lifetime — that is what lets React skip this subtree when a *different*
 * field changes.
 */
const TextInput = memo(function TextInput({
  name,
  label,
  value,
  error,
  helperText,
  disabled,
  required,
  placeholder,
  type,
  multiline,
  minRows,
  autoFocus,
  onChange,
  onBlur,
}: {
  name: TextKey;
  label: string;
  value: string;
  error?: boolean;
  helperText?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  type?: string;
  multiline?: boolean;
  minRows?: number;
  autoFocus?: boolean;
  onChange: (key: TextKey, value: string) => void;
  onBlur: (key: TextKey) => void;
}) {
  return (
    <TextField
      label={label}
      type={type}
      value={value}
      onChange={(e) => onChange(name, e.target.value)}
      onBlur={() => onBlur(name)}
      error={error}
      helperText={helperText}
      fullWidth
      required={required}
      disabled={disabled}
      placeholder={placeholder}
      multiline={multiline}
      minRows={minRows}
      autoFocus={autoFocus}
    />
  );
});

/** Select counterpart. Options come in as a memoized array so the identity check holds. */
const SelectInput = memo(function SelectInput({
  name,
  label,
  value,
  options,
  placeholderLabel,
  error,
  helperText,
  disabled,
  required,
  onChange,
  onBlur,
}: {
  name: SelectKey;
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  /** Shown as a disabled first entry when there is no value yet (create mode). */
  placeholderLabel?: string;
  error?: boolean;
  helperText?: string;
  disabled?: boolean;
  required?: boolean;
  onChange: (key: SelectKey, value: string) => void;
  onBlur: (key: SelectKey) => void;
}) {
  return (
    <TextField
      select
      label={label}
      value={value}
      onChange={(e) => onChange(name, e.target.value)}
      onBlur={() => onBlur(name)}
      error={error}
      helperText={helperText}
      fullWidth
      required={required}
      disabled={disabled}
      InputLabelProps={SHRINK_LABEL}
      SelectProps={DISPLAY_EMPTY}
    >
      {placeholderLabel && (
        <MenuItem value="" disabled>
          {placeholderLabel}
        </MenuItem>
      )}
      {options.map((o) => (
        <MenuItem key={o.value} value={o.value}>
          {o.label}
        </MenuItem>
      ))}
    </TextField>
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

  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  // Errors stay hidden until a field is left or the form is submitted, so a blank form never
  // opens covered in red.
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);

  // Latest form/mode for the blur handler to validate against. Reading through a ref is what
  // keeps `blurField` identity-stable, which is what keeps the memoized inputs from
  // re-rendering on every keystroke.
  const formRef = useRef(form);
  formRef.current = form;
  const isEditRef = useRef(isEdit);
  isEditRef.current = isEdit;

  // Reset whenever the dialog opens, or switches to a different user.
  useEffect(() => {
    if (!open) return;
    setForm(user ? stateFromUser(user) : EMPTY);
    setErrors({});
    setTouched({});
    setSubmitted(false);
  }, [open, user]);

  /** Blank optional fields go as undefined so an empty box never stores "". */
  const buildPayload = useCallback((f: FormState, edit: boolean) => {
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
    (f: FormState, edit: boolean): FieldErrors => {
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

  const setField = useCallback((key: TextKey | SelectKey, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
  }, []);

  const blurField = useCallback(
    (key: TextKey | SelectKey | 'phone') => {
      setTouched((t) => (t[key] ? t : { ...t, [key]: true }));
      setErrors(validate(formRef.current, isEditRef.current));
    },
    [validate],
  );

  const setPhone = useCallback(
    ({ iso2, national, e164 }: { iso2: string; national: string; e164: string }) => {
      setForm((f) => ({ ...f, phoneIso2: iso2, phoneNational: national, phone: e164 }));
    },
    [],
  );

  const blurPhone = useCallback(() => blurField('phone'), [blurField]);

  /** Whether a field's error should be on screen yet. */
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
    const found = validate(form, isEdit);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      enqueueSnackbar('Please fix the highlighted fields', { variant: 'warning' });
      return;
    }

    setSaving(true);

    if (isEdit) {
      const body = {
        ...buildPayload(form, true),
        // Role/status are omitted for the protected Super Admin — the server rejects them.
        ...(user!.isProtected ? {} : { role: form.role, status: form.status }),
      };
      const res = await apiPatch(`/api/auth/users/${user!._id}`, body);
      setSaving(false);
      if (!res.ok) return showFailure(res.error, res.details, 'Could not update user');
      enqueueSnackbar('User updated', { variant: 'success' });
      close();
      onSaved();
      return;
    }

    const res = await apiPost<{ emailSent?: boolean }>(
      '/api/auth/users',
      buildPayload(form, false),
    );
    setSaving(false);
    if (!res.ok) return showFailure(res.error, res.details, 'Failed to create user');

    // The account exists either way; only the invite may have failed. Say which happened
    // rather than reporting a plain success the admin would wrongly trust.
    enqueueSnackbar(
      res.data?.emailSent === false
        ? 'User created, but the invite email could not be sent'
        : 'User created. Invite email sent.',
      { variant: res.data?.emailSent === false ? 'warning' : 'success' },
    );
    close();
    onSaved();
  }

  // Administrator first, then Accountant. Admin is only offered to a Super Admin; the current
  // role is prepended in edit mode so the select is never empty.
  const roleOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [
      ...(canCreateAdmin ? [{ value: Role.Admin, label: ROLE_LABEL.admin }] : []),
      { value: Role.Accountant, label: ROLE_LABEL.accountant },
    ];
    if (isEdit && form.role && !options.some((o) => o.value === form.role)) {
      options.unshift({ value: form.role, label: ROLE_LABEL[form.role] ?? form.role });
    }
    return options;
  }, [canCreateAdmin, isEdit, form.role]);

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
      <Stack spacing={3}>
        <FormSection title="Basic details">
          <Grid container spacing={2}>
            <Grid size={12}>
              <TextInput
                name="name"
                label="Name"
                value={form.name}
                helperText={shown('name')}
                error={Boolean(shown('name'))}
                required
                autoFocus={!isEdit}
                disabled={saving}
                onChange={setField}
                onBlur={blurField}
              />
            </Grid>
            <Grid size={12}>
              {/* Email is the account identity, so it is set once at creation. */}
              <TextInput
                name="email"
                label="Email"
                type="email"
                value={form.email}
                helperText={
                  isEdit ? 'Email is the account identity and cannot be changed.' : shown('email')
                }
                error={!isEdit && Boolean(shown('email'))}
                required={!isEdit}
                disabled={saving || isEdit}
                onChange={setField}
                onBlur={blurField}
              />
            </Grid>
            <Grid size={12}>
              <PhoneField
                iso2={form.phoneIso2}
                national={form.phoneNational}
                onChange={setPhone}
                onBlur={blurPhone}
                helperText={shown('phone')}
                error={Boolean(shown('phone'))}
                required
                disabled={saving}
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
                value={form.role}
                options={roleOptions}
                placeholderLabel={isEdit ? undefined : 'Select a role'}
                helperText={locked ? 'Protected user role cannot be changed.' : shown('role')}
                error={!locked && Boolean(shown('role'))}
                required
                disabled={saving || locked}
                onChange={setField}
                onBlur={blurField}
              />
            </Grid>

            {/* Status only exists for an account that already exists. */}
            {isEdit && (
              <Grid size={12}>
                <SelectInput
                  name="status"
                  label="Status"
                  value={form.status}
                  options={STATUS_OPTIONS}
                  disabled={saving || locked}
                  onChange={setField}
                  onBlur={blurField}
                />
              </Grid>
            )}

            <Grid size={12}>
              <TextInput
                name="jobTitle"
                label="Job title"
                value={form.jobTitle}
                helperText={shown('jobTitle')}
                error={Boolean(shown('jobTitle'))}
                disabled={saving}
                placeholder="e.g. Office Manager"
                onChange={setField}
                onBlur={blurField}
              />
            </Grid>
          </Grid>
        </FormSection>

        <FormSection title="Internal notes">
          <TextInput
            name="notes"
            label="Notes"
            value={form.notes}
            helperText={shown('notes')}
            error={Boolean(shown('notes'))}
            disabled={saving}
            multiline
            minRows={2}
            placeholder="Only visible to admins"
            onChange={setField}
            onBlur={blurField}
          />
        </FormSection>
      </Stack>
    </Modal>
  );
}
