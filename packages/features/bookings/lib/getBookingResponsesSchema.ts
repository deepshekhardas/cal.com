import type { ALL_VIEWS } from "@calcom/features/form-builder/schema";
import { type FieldZodCtx, fieldTypesSchemaMap } from "@calcom/features/form-builder/schema";
import { dbReadResponseSchema } from "@calcom/lib/dbReadResponseSchema";
import logger from "@calcom/lib/logger";
import type { eventTypeBookingFields } from "@calcom/prisma/zod-utils";
import { bookingResponses, emailSchemaRefinement } from "@calcom/prisma/zod-utils";
import { isValidPhoneNumber } from "libphonenumber-js/max";
import z from "zod";

type View = ALL_VIEWS | (string & {});
type BookingFields = (z.infer<typeof eventTypeBookingFields> & z.BRAND<"HAS_SYSTEM_FIELDS">) | null;
type TranslationFunction = (key: string, options?: Record<string, unknown>) => string;
type CommonParams = { bookingFields: BookingFields; view: View; translateFn?: TranslationFunction };

export const bookingResponse = dbReadResponseSchema;
export const bookingResponsesDbSchema = z.record(dbReadResponseSchema);

const catchAllSchema = bookingResponsesDbSchema;

/**
 * Processes a single field's response value based on its type.
 * Returns the processed value that should be stored in newResponses[field.name].
 */
function preprocessField({
  field,
  value,
  isPartialSchema,
}: {
  field: NonNullable<BookingFields>[number];
  value: unknown;
  isPartialSchema: boolean;
  log: ReturnType<typeof logger.getSubLogger>;
}): unknown {
  const fieldTypeSchema = fieldTypesSchemaMap[field.type as keyof typeof fieldTypesSchemaMap];
  if (fieldTypeSchema) {
    return fieldTypeSchema.preprocess({
      response: value,
      isPartialSchema,
      field: field as any,
    });
  }
  return value;
}

/**
 * Runs superRefine validation for a field's response value based on its type.
 * Handles all field type validations including email, phone, multiselect, etc.
 * Throws on configuration errors (e.g., invalid variant) - caller should wrap in try-catch for partial schemas.
 */
async function superRefineField({
  field,
  value,
  isPartialSchema,
  isRequired,
  zodCtx,
  translateFn,
}: {
  field: NonNullable<BookingFields>[number];
  value: unknown;
  isPartialSchema: boolean;
  isRequired: boolean;
  checkOptional: boolean;
  zodCtx: FieldZodCtx;
  translateFn?: TranslationFunction;
  responses: Record<string, unknown>;
}): Promise<void> {
  // Tag the message with the input name so that the message can be shown at appropriate place
  const m = (message: string, options?: Record<string, unknown>) => {
    const translatedMessage = translateFn ? translateFn(message, options) : message;
    return `{${field.name}}${translatedMessage}`;
  };

  if (isRequired && !isPartialSchema && !value) {
    zodCtx.addIssue({ code: z.ZodIssueCode.custom, message: m(`error_required_field`) });
    return;
  }

  const fieldTypeSchema = fieldTypesSchemaMap[field.type as keyof typeof fieldTypesSchemaMap];
  if (fieldTypeSchema) {
    fieldTypeSchema.superRefine({
      // We use `unknown` here because the response type is not trivial to know here
      // We know for sure that the value here is preprocessed(considering how we have called z.preprocess())
      // and thus the fieldTypeSchema implementation could rely on having the correct type as per its preprocess fn return value
      response: value as unknown as any,
      ctx: zodCtx,
      m,
      field: field as any,
      isPartialSchema,
    });
    return;
  }

  zodCtx.addIssue({
    code: z.ZodIssueCode.custom,
    message: `Can't parse unknown booking field type: ${field.type}`,
  });
}

/**
 * Checks if a booker email matches an email/domain entry.
 * Supports three formats:
 * - Full email: "user@example.com" - matches exactly
 * - Domain with @ prefix: "@example.com" - matches any email ending with "@example.com"
 * - Domain without @ prefix: "example.com" - matches any email ending with "@example.com"
 */
const doesEmailMatchEntry = (bookerEmail: string, entry: string): boolean => {
  const bookerEmailLower = bookerEmail.toLowerCase();

  if (entry.startsWith("@")) {
    const domain = entry.slice(1).toLowerCase();
    return bookerEmailLower.endsWith("@" + domain);
  }

  if (entry.includes("@")) {
    return bookerEmailLower === entry.toLowerCase();
  }

  return bookerEmailLower.endsWith("@" + entry.toLowerCase());
};
export const getBookingResponsesPartialSchema = ({ bookingFields, view, translateFn }: CommonParams) => {
  const schema = bookingResponses.unwrap().partial().and(catchAllSchema);
  return preprocess({ schema, bookingFields, isPartialSchema: true, view, translateFn });
};

// Should be used when we know that not all fields responses are present
// - Can happen when we are parsing the prefill query string
// - Can happen when we are parsing a booking's responses (which was created before we added a new required field)
export default function getBookingResponsesSchema({ bookingFields, view, translateFn }: CommonParams) {
  const schema = bookingResponses.and(z.record(z.any()));
  return preprocess({ schema, bookingFields, isPartialSchema: false, view, translateFn });
}

// Should be used when we want to check if the optional fields are entered and valid as well
export function getBookingResponsesSchemaWithOptionalChecks({
  bookingFields,
  view,
  translateFn,
}: CommonParams) {
  const schema = bookingResponses.and(z.record(z.any()));
  return preprocess({
    schema,
    bookingFields,
    isPartialSchema: false,
    view,
    checkOptional: true,
    translateFn,
  });
}

type FieldZodCtxState = {
  issues: z.IssueData[];
} | null;

const buildFieldZodCtx = ({
  zodCtx,
  isPartialSchema,
}: {
  zodCtx: z.RefinementCtx;
  isPartialSchema: boolean;
}): {
  fieldZodCtx: FieldZodCtx;
  state: FieldZodCtxState;
} => {
  if (isPartialSchema) {
    const state: FieldZodCtxState = {
      issues: [],
    };
    return {
      fieldZodCtx: {
        addIssue: (issue: z.IssueData) => {
          state.issues.push(issue);
        },
      },
      state,
    };
  }
  return {
    fieldZodCtx: zodCtx,
    state: null,
  };
};

// It allows anyone using FormBuilder to get the same preprocessing automatically
// It allows anyone using FormBuilder to get the same preprocessing automatically
function preprocess<T extends z.ZodType>({
  schema,
  bookingFields,
  isPartialSchema,
  view: currentView,
  checkOptional = false,
  translateFn,
}: CommonParams & {
  schema: T;
  // It is useful when we want to prefill the responses with the partial values. Partial can be in 2 ways
  // - Not all required fields are need to be provided for prefill.
  // - Even a field response itself can be partial so the content isn't validated e.g. a field with type="phone" can be given a partial phone number(e.g. Specifying the country code like +91)
  isPartialSchema: boolean;
  checkOptional?: boolean;
}): z.ZodType<z.infer<T>, z.infer<T>, z.infer<T>> {
  const log = logger.getSubLogger({ prefix: ["getBookingResponsesSchema"] });
  const preprocessed = z.preprocess(
    (responses) => {
      const parsedResponses = z.record(z.any()).nullable().parse(responses) || {};
      const newResponses = {} as typeof parsedResponses;
      // if eventType has been deleted, we won't have bookingFields and thus we can't preprocess or validate them.
      if (!bookingFields) return parsedResponses;
      bookingFields.forEach((field) => {
        const value = parsedResponses[field.name];
        if (value === undefined) {
          // If there is no response for the field, then we don't need to do any processing
          return;
        }
        const views = field.views;
        const isFieldApplicableToCurrentView =
          currentView === "ALL_VIEWS" ? true : views ? views.find((view) => view.id === currentView) : true;
        if (!isFieldApplicableToCurrentView) {
          // If the field is not applicable in the current view, then we don't need to do any processing
          return;
        }

        try {
          newResponses[field.name] = preprocessField({ field, value, isPartialSchema, log });
        } catch (e) {
          if (!isPartialSchema) {
            throw e;
          }
          const errorMessage = e instanceof Error ? e.message : "preprocessing failed";
          const invalidFieldName = field.name;
          // Remove invalid field like it never existed in the first place
          delete parsedResponses[invalidFieldName];
          console.warn(`Skipped invalid field during preprocessing: ${invalidFieldName} (${errorMessage})`);
        }
      });

      return {
        ...parsedResponses,
        ...newResponses,
      };
    },
    schema.superRefine(async (responses, ctx) => {
      if (!bookingFields) {
        // if eventType has been deleted, we won't have bookingFields and thus we can't validate the responses.
        return;
      }

      const attendeePhoneNumberField = bookingFields.find((field) => field.name === "attendeePhoneNumber");
      const isAttendeePhoneNumberFieldHidden = attendeePhoneNumberField?.hidden;

      const emailField = bookingFields.find((field) => field.name === "email");
      const isEmailFieldHidden = !!emailField?.hidden;

      // To prevent using user's session email as attendee's email, we set email to empty string
      if (isEmailFieldHidden && !isAttendeePhoneNumberFieldHidden) {
        responses["email"] = "";
      }

      for (const bookingField of bookingFields) {
        const value = responses[bookingField.name];
        const views = bookingField.views;
        const isFieldApplicableToCurrentView =
          currentView === "ALL_VIEWS" ? true : views ? views.find((view) => view.id === currentView) : true;
        let hidden = bookingField.hidden;
        const numOptions = bookingField.options?.length ?? 0;
        if (bookingField.hideWhenJustOneOption) {
          hidden = hidden || numOptions <= 1;
        }
        let isRequired = false;
        // If the field is hidden, then it can never be required
        if (!hidden && isFieldApplicableToCurrentView) {
          isRequired = checkOptional || !!bookingField.required;
        }

        if ((isPartialSchema || !isRequired) && value === undefined) {
          continue;
        }

        // For partial schemas, use a proxy ctx to capture issues
        const { fieldZodCtx, state } = buildFieldZodCtx({
          zodCtx: ctx,
          isPartialSchema,
        });

        let superRefineError = false;
        try {
          await superRefineField({
            field: bookingField,
            value,
            isPartialSchema,
            isRequired,
            checkOptional,
            zodCtx: fieldZodCtx,
            translateFn,
            responses,
          });
        } catch (e) {
          if (!isPartialSchema) {
            throw e;
          }
          superRefineError = true;
        }

        // For partial schemas, remove invalid fields from responses
        const issues = state?.issues ?? [];
        if (isPartialSchema && (superRefineError || issues.length > 0)) {
          delete responses[bookingField.name];
          console.warn(
            `Partial prefill: skipped field '${bookingField.name}' due to ${issues.length} validation error(s)`
          );
        }
      }
    })
  );
  if (isPartialSchema) {
    // Query Params can be completely invalid, try to preprocess as much of it in correct format but in worst case simply don't prefill instead of crashing
    return preprocessed.catch((res?: { error?: unknown[] }) => {
      console.error("Failed to validate query params, prefilling will be skipped entirely", res?.error);
      return {};
    });
  }
  return preprocessed;
}
