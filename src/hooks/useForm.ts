/**
 * useForm - Form state management hook with validation support
 * 
 * Reduces boilerplate for form handling across components
 */

import { useState, useCallback, useMemo } from 'react';

type ValidationRule<T> = {
  validate: (value: any, formData: T) => boolean;
  message: string;
};

type ValidationRules<T> = {
  [K in keyof T]?: ValidationRule<T>[];
};

interface UseFormOptions<T> {
  /** Initial form values */
  initialValues: T;
  /** Validation rules for each field */
  validationRules?: ValidationRules<T>;
  /** Callback when form is submitted successfully */
  onSubmit?: (values: T) => void | Promise<void>;
}

interface UseFormReturn<T> {
  /** Current form values */
  values: T;
  /** Validation errors per field */
  errors: Partial<Record<keyof T, string>>;
  /** Touched state per field */
  touched: Partial<Record<keyof T, boolean>>;
  /** Whether form is currently submitting */
  isSubmitting: boolean;
  /** Whether form has any errors */
  hasErrors: boolean;
  /** Whether form has been modified */
  isDirty: boolean;
  /** Update a single field value */
  setValue: <K extends keyof T>(field: K, value: T[K]) => void;
  /** Update multiple field values */
  setValues: (values: Partial<T>) => void;
  /** Mark a field as touched */
  setTouched: (field: keyof T) => void;
  /** Set error for a field manually */
  setError: (field: keyof T, error: string | null) => void;
  /** Validate a single field */
  validateField: (field: keyof T) => boolean;
  /** Validate all fields */
  validateAll: () => boolean;
  /** Reset form to initial values */
  reset: () => void;
  /** Get input props for a field */
  getFieldProps: (field: keyof T) => {
    value: T[keyof T];
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
    onBlur: () => void;
    name: string;
  };
  /** Handle form submission */
  handleSubmit: (e?: React.FormEvent) => Promise<void>;
}

/**
 * Form management hook with validation
 * 
 * @example
 * const form = useForm({
 *   initialValues: { name: '', email: '' },
 *   validationRules: {
 *     name: [{ validate: v => v.length > 0, message: 'Name is required' }],
 *     email: [{ validate: v => /\S+@\S+\.\S+/.test(v), message: 'Invalid email' }],
 *   },
 *   onSubmit: async (values) => {
 *     await api.createUser(values);
 *   }
 * });
 */
export function useForm<T extends Record<string, any>>(
  options: UseFormOptions<T>
): UseFormReturn<T> {
  const { initialValues, validationRules = {}, onSubmit } = options;

  const [values, setValuesState] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [touched, setTouchedState] = useState<Partial<Record<keyof T, boolean>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isDirty = useMemo(() => {
    return JSON.stringify(values) !== JSON.stringify(initialValues);
  }, [values, initialValues]);

  const hasErrors = useMemo(() => {
    return Object.values(errors).some(error => error !== null && error !== undefined);
  }, [errors]);

  const setValue = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
    setValuesState(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    setErrors(prev => ({ ...prev, [field]: undefined }));
  }, []);

  const setValues = useCallback((newValues: Partial<T>) => {
    setValuesState(prev => ({ ...prev, ...newValues }));
  }, []);

  const setTouched = useCallback((field: keyof T) => {
    setTouchedState(prev => ({ ...prev, [field]: true }));
  }, []);

  const setError = useCallback((field: keyof T, error: string | null) => {
    setErrors(prev => ({ ...prev, [field]: error || undefined }));
  }, []);

  const validateField = useCallback((field: keyof T): boolean => {
    const rules = validationRules[field];
    if (!rules) return true;

    for (const rule of rules) {
      if (!rule.validate(values[field], values)) {
        setErrors(prev => ({ ...prev, [field]: rule.message }));
        return false;
      }
    }

    setErrors(prev => ({ ...prev, [field]: undefined }));
    return true;
  }, [values, validationRules]);

  const validateAll = useCallback((): boolean => {
    let isValid = true;
    const newErrors: Partial<Record<keyof T, string>> = {};

    for (const field of Object.keys(validationRules) as (keyof T)[]) {
      const rules = validationRules[field];
      if (!rules) continue;

      for (const rule of rules) {
        if (!rule.validate(values[field], values)) {
          newErrors[field] = rule.message;
          isValid = false;
          break;
        }
      }
    }

    setErrors(newErrors);
    return isValid;
  }, [values, validationRules]);

  const reset = useCallback(() => {
    setValuesState(initialValues);
    setErrors({});
    setTouchedState({});
    setIsSubmitting(false);
  }, [initialValues]);

  const getFieldProps = useCallback((field: keyof T) => ({
    value: values[field],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const value = e.target.type === 'checkbox' 
        ? (e.target as HTMLInputElement).checked 
        : e.target.value;
      setValue(field, value as T[keyof T]);
    },
    onBlur: () => {
      setTouched(field);
      validateField(field);
    },
    name: String(field),
  }), [values, setValue, setTouched, validateField]);

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (!validateAll()) return;

    setIsSubmitting(true);
    try {
      await onSubmit?.(values);
    } finally {
      setIsSubmitting(false);
    }
  }, [validateAll, onSubmit, values]);

  return {
    values,
    errors,
    touched,
    isSubmitting,
    hasErrors,
    isDirty,
    setValue,
    setValues,
    setTouched,
    setError,
    validateField,
    validateAll,
    reset,
    getFieldProps,
    handleSubmit,
  };
}

export default useForm;
