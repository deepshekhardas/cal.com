import { fieldSchema, fieldTypeEnum, variantsConfigSchema, emailSchemaRefinement } from "@calcom/prisma/zod-utils";
import { isValidPhoneNumber } from "libphonenumber-js/max";
import { z } from "zod";
import { fieldTypesConfigMap } from "./fieldTypes";
import { preprocessNameFieldDataWithVariant } from "./utils";
import { getConfig as getVariantsConfig } from "./utils/variantsConfig";

const nonEmptyString = () => z.string().refine((value: string) => value.trim().length > 0);

type FieldTypeSchemaConfig<TInput = unknown, TPreprocessedOutput = unknown> = {
  preprocess: (data: {
    field: z.infer<typeof fieldSchema>;
    response: TInput;
    isPartialSchema: boolean;
  }) => TPreprocessedOutput;
  superRefine: (data: {
    field: z.infer<typeof fieldSchema>;
    response: TPreprocessedOutput;
    isPartialSchema: boolean;
    ctx: FieldZodCtx;
    m: (key: string, options?: Record<string, unknown>) => string;
  }) => void;
};

function defineFieldSchema<TInput, TOutput>(
  config: FieldTypeSchemaConfig<TInput, TOutput>
): FieldTypeSchemaConfig<TInput, TOutput> {
  return config;
}

export type ALL_VIEWS = "ALL_VIEWS";

// It is the config that is specific to a type and doesn't make sense in all fields individually. Any field with the type will automatically inherit this config.
// This allows making changes to the UI without having to make changes to the existing stored configs
export const fieldTypeConfigSchema = z
  .object({
    label: z.string(),
    value: fieldTypeEnum,
    isTextType: z.boolean().default(false).optional(),
    systemOnly: z.boolean().default(false).optional(),
    needsOptions: z.boolean().default(false).optional(),
    supportsLengthCheck: z
      .object({
        maxLength: z.number(),
      })
      .optional(),
    supportsPricing: z.boolean().default(false).optional(),
    optionsSupportPricing: z.boolean().default(false).optional(),
    propsType: z.enum([
      "text",
      "textList",
      "select",
      "multiselect",
      "boolean",
      "objectiveWithInput",
      "variants",
    ]),
    // It is the config that can tweak what an existing or a new field shows in the App UI or booker UI.
    variantsConfig: z
      .object({
        /**
         * This is the default variant that will be used when a new field is created.
         */
        defaultVariant: z.string(),

        /**
         *  Used only when there are 2 variants, so that UI can be simplified by showing a switch(with this label) instead of a Select
         */
        toggleLabel: z.string().optional(),
        variants: z.record(
          z.object({
            /**
             * That's how the variant would be labelled in App UI. This label represents the field in booking questions' list
             * Supports translation
             */
            label: z.string(),
            fieldsMap: z.record(
              z.object({
                /**
                 * Supports translation
                 */
                defaultLabel: z.string().optional(),
                /**
                 * Supports translation
                 */
                defaultPlaceholder: z.string().optional(),
                /**
                 * Decides if a variant field's required property can be changed or not
                 */
                canChangeRequirability: z.boolean().default(true).optional(),
              })
            ),
          })
        ),
        /**
         * This is the default configuration for the field.
         */
        defaultValue: variantsConfigSchema.optional(),
      })
      .optional(),
  })
  .refine((data) => {
    if (!data.variantsConfig) {
      return;
    }
    const variantsConfig = data.variantsConfig;
    if (!variantsConfig.variants[variantsConfig.defaultVariant]) {
      throw new Error(`defaultVariant: ${variantsConfig.defaultVariant} is not in variants`);
    }
    return true;
  });

export const fieldsSchema = z.array(fieldSchema);

function stringifyResponse(response: unknown): string {
  if (typeof response !== "string") {
    return String(response);
  } else {
    return response;
  }
}

const ensureValidPhoneNumber = (value: string) => {
  if (!value) return "";
  // + in URL could be replaced with space, so we need to replace it back
  // Replace the space(s) in the beginning with + as it is supposed to be provided in the beginning only
  return value.replace(/^ +/, "+");
};

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

export const fieldTypesSchemaMap = {
  name: defineFieldSchema<unknown, unknown>({
    preprocess: ({ response, field }) => {
      const fieldTypeConfig = fieldTypesConfigMap[field.type];

      const variantInResponse = field.variant || fieldTypeConfig?.variantsConfig?.defaultVariant;
      let correctedVariant: "firstAndLastName" | "fullName";

      if (!variantInResponse) {
        throw new Error("`variant` must be there for the field with `variantsConfig`");
      }

      if (variantInResponse !== "firstAndLastName" && variantInResponse !== "fullName") {
        correctedVariant = "fullName";
      } else {
        correctedVariant = variantInResponse;
      }

      // We return this default value so that it meets the requirement of 'name' field being required in  zod-utils#bookingResponses
      const defaultValue = "";
      if (response === null || response === undefined) {
        return defaultValue;
      }

      if (typeof response === "string") {
        const nameJsonSchema = z.object({
          firstName: z.string(),
          lastName: z.string().optional().default(""),
        });

        try {
          const parsed = nameJsonSchema.safeParse(JSON.parse(response));
          if (parsed.success) {
            return preprocessNameFieldDataWithVariant(correctedVariant, parsed.data);
          }
        } catch {
          // if invalid JSON, then treat as regular string
        }
        return preprocessNameFieldDataWithVariant(correctedVariant, response);
      }

      if (typeof response === "object" && "firstName" in response && typeof response.firstName === "string") {
        const firstAndLastNameResponse = {
          firstName: response.firstName,
          lastName: "",
        };
        if ("lastName" in response && typeof response.lastName === "string") {
          firstAndLastNameResponse.lastName = response.lastName;
        }
        return preprocessNameFieldDataWithVariant(correctedVariant, firstAndLastNameResponse);
      }

      return defaultValue;
    },
    superRefine: ({ field, response, isPartialSchema, ctx, m }) => {
      const stringSchema = z.string();
      const fieldTypeConfig = fieldTypesConfigMap[field.type];
      const variantInResponse = field.variant || fieldTypeConfig?.variantsConfig?.defaultVariant;
      if (!variantInResponse) {
        throw new Error("`variant` must be there for the field with `variantsConfig`");
      }

      const variantsConfig = getVariantsConfig(field);

      if (!variantsConfig) {
        throw new Error("variantsConfig must be there for `name` field");
      }

      const fields =
        variantsConfig.variants[variantInResponse as keyof typeof variantsConfig.variants].fields;

      const variantSupportedFields = ["text"];

      if (fields.length === 1) {
        const field = fields[0];
        if (variantSupportedFields.includes(field.type)) {
          const schema = field.required && !isPartialSchema ? nonEmptyString() : stringSchema;
          if (!schema.safeParse(response).success) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: m("Invalid string") });
          }
          return;
        } else {
          throw new Error(`Unsupported field.type with variants: ${field.type}`);
        }
      }
      fields.forEach((subField) => {
        const schema = subField.required && !isPartialSchema ? nonEmptyString() : stringSchema;
        if (!variantSupportedFields.includes(subField.type)) {
          throw new Error(`Unsupported field.type with variants: ${subField.type}`);
        }
        const valueIdentified = response as Record<string, string>;
        if (subField.required) {
          if (!isPartialSchema && !valueIdentified[subField.name])
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: m(`error_required_field`) });
          if (!schema.safeParse(valueIdentified[subField.name]).success) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: m("Invalid string") });
            return;
          }
        }
      });
    },
  }),
  textarea: defineFieldSchema<unknown, string>({
    preprocess: ({ response }) => {
      return stringifyResponse(response).trim();
    },
    superRefine: ({ field, response, ctx, m }) => {
      const fieldTypeConfig = fieldTypesConfigMap[field.type];
      const value = response ?? "";
      const maxLength = field.maxLength ?? fieldTypeConfig.supportsLengthCheck?.maxLength;
      const minLength = field.minLength ?? 0;
      if (!maxLength) {
        throw new Error("maxLength must be there for textarea field");
      }
      const hasExceededMaxLength = value.length > maxLength;
      const hasNotReachedMinLength = value.length < minLength;
      if (hasExceededMaxLength) {
        const message = m(`max_characters_allowed`, { count: maxLength });
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message,
        });
        return;
      }
      if (hasNotReachedMinLength) {
        const message = m(`min_characters_required`, { count: minLength });
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message,
        });
        return;
      }
    },
  }),
  url: defineFieldSchema<unknown, string>({
    preprocess: ({ response }) => {
      return stringifyResponse(response).trim();
    },
    superRefine: ({ response, ctx, m }) => {
      const value = response ?? "";
      const urlSchema = z.string().url();

      // Check for malformed protocols (missing second slash test case)
      if (value.match(/^https?:\/[^/]/)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: m("url_validation_error"),
        });
        return;
      }

      // 1. Try validating the original value
      if (urlSchema.safeParse(value).success) {
        return;
      }

      // 2. If it failed, try prepending https://
      const domainLike = /^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i;
      if (domainLike.test(value)) {
        const valueWithHttps = `https://${value}`;
        if (urlSchema.safeParse(valueWithHttps).success) {
          return;
        }
      }

      // 3. If all attempts fail, throw err
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: m("url_validation_error"),
      });
    },
  }),
  email: defineFieldSchema<unknown, string>({
    preprocess: ({ response }) => {
      return stringifyResponse(response).trim();
    },
    superRefine: ({ field, response, isPartialSchema, ctx, m }) => {
      const emailSchema = isPartialSchema ? z.string() : z.string().refine(emailSchemaRefinement);
      const isRequired = field.required && !isPartialSchema;
      if (!field.hidden && (isRequired || (response && String(response).trim() !== ""))) {
        if (!emailSchema.safeParse(response).success) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: m("email_validation_error"),
          });
        }

        if (response) {
          const bookerEmail = String(response);
          const excludedEmails = (field as any).excludeEmails?.split(",").map((domain: string) => domain.trim()) || [];
          const match = excludedEmails.find((excludedEntry: string) => doesEmailMatchEntry(bookerEmail, excludedEntry));
          if (match) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: m("exclude_emails_match_found_error_message"),
            });
          }
          const requiredEmails =
            ((field as any).requireEmails as string | undefined)
              ?.split(",")
              .map((domain) => domain.trim())
              .filter(Boolean) || [];
          const requiredEmailsMatch = requiredEmails.find((requiredEntry) =>
            doesEmailMatchEntry(bookerEmail, requiredEntry)
          );
          if (requiredEmails.length > 0 && !requiredEmailsMatch) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: m("require_emails_no_match_found_error_message"),
            });
          }
        }
      }
    },
  }),
  phone: defineFieldSchema<unknown, string>({
    preprocess: ({ response }) => {
      return ensureValidPhoneNumber(stringifyResponse(response));
    },
    superRefine: ({ field, response, isPartialSchema, ctx, m }) => {
      const isRequired = field.required && !isPartialSchema;
      const needsValidation = isRequired || (response && String(response).trim() !== "");
      if (!field.hidden && needsValidation) {
        const phoneSchema = isPartialSchema
          ? z.string()
          : z.string().refine(async (val) => {
            return isValidPhoneNumber(val);
          });
        if (!phoneSchema.safeParse(response).success) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: m("invalid_number") });
        }
      }
    },
  }),
  multiemail: defineFieldSchema<unknown, string[]>({
    preprocess: ({ response }) => {
      return response instanceof Array ? response : [response];
    },
    superRefine: ({ field, response, isPartialSchema, ctx, m }) => {
      const emailSchema = isPartialSchema ? z.string() : z.string().refine(emailSchemaRefinement);
      const isRequired = field.required && !isPartialSchema;
      if (isRequired && (!response || (response as unknown[]).length === 0)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: m(`error_required_field`) });
        return;
      }
      const emailsParsed = emailSchema.array().safeParse(response);
      if (!emailsParsed.success) {
        if (field.name === "guests" && (response as string[]).every((email: string) => email === "")) {
          return;
        }
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: m("email_validation_error"),
        });
        return;
      }
      const emails = emailsParsed.data;
      emails.sort().some((item, i) => {
        if (item === emails[i + 1]) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: m("duplicate_email") });
          return true;
        }
      });
    },
  }),
  multiselect: defineFieldSchema<unknown, string[]>({
    preprocess: ({ response }) => {
      return response instanceof Array ? response : [response];
    },
    superRefine: ({ field, response, isPartialSchema, ctx, m }) => {
      const isRequired = field.required && !isPartialSchema;
      if (isRequired && (!response || (response as unknown[]).length === 0)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: m(`error_required_field`) });
        return;
      }
      if (!z.string().array().safeParse(response).success) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: m("Invalid array of strings") });
      }
    },
  }),
  checkbox: defineFieldSchema<unknown, string[]>({
    preprocess: ({ response }) => {
      return response instanceof Array ? response : [response];
    },
    superRefine: ({ field, response, isPartialSchema, ctx, m }) => {
      const isRequired = field.required && !isPartialSchema;
      if (isRequired && (!response || (response as unknown[]).length === 0)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: m(`error_required_field`) });
        return;
      }
      if (!z.string().array().safeParse(response).success) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: m("Invalid array of strings") });
      }
    },
  }),
  boolean: defineFieldSchema<unknown, boolean>({
    preprocess: ({ response }) => {
      return response === "true" || response === true;
    },
    superRefine: ({ response, ctx, m }) => {
      if (!z.boolean().safeParse(response).success) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: m("Invalid Boolean") });
      }
    },
  }),
  radioInput: defineFieldSchema<unknown, { optionValue: string; value: string }>({
    preprocess: ({ response, field }) => {
      let parsedValue = { optionValue: "", value: "" };
      if (typeof response === "string") {
        try {
          parsedValue = JSON.parse(response);
        } catch (e) { }
      } else if (typeof response === "object" && response !== null) {
        parsedValue = response as { optionValue: string; value: string };
      }
      const optionsInputs = (field as any).optionsInputs;
      const optionInputField = optionsInputs?.[parsedValue.value];
      if (optionInputField && optionInputField.type === "phone") {
        parsedValue.optionValue = ensureValidPhoneNumber(parsedValue.optionValue);
      }
      return parsedValue;
    },
    superRefine: ({ field, response, isPartialSchema, ctx, m }) => {
      const typedValue = response as { optionValue?: string; value?: string } | undefined;
      const optionValue = typedValue?.optionValue;
      const optionsInputs = (field as any).optionsInputs;
      const optionField = optionsInputs?.[typedValue?.value ?? ""];
      const isRequired = field.required && !isPartialSchema;
      if ((isRequired || typedValue?.value) && optionField?.required && !optionValue) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: m("error_required_field") });
        return;
      }
      if (optionValue && optionField?.type === "phone") {
        if (!isValidPhoneNumber(optionValue)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: m("invalid_number") });
        }
      }
    },
  }),
  radio: defineFieldSchema<unknown, string>({
    preprocess: ({ response }) => stringifyResponse(response).trim(),
    superRefine: ({ response, ctx, m }) => {
      if (!z.string().safeParse(response).success) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: m("Invalid string") });
      }
    },
  }),
  select: defineFieldSchema<unknown, string>({
    preprocess: ({ response }) => stringifyResponse(response).trim(),
    superRefine: ({ response, ctx, m }) => {
      if (!z.string().safeParse(response).success) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: m("Invalid string") });
      }
    },
  }),
  text: defineFieldSchema<unknown, string>({
    preprocess: ({ response }) => stringifyResponse(response).trim(),
    superRefine: ({ response, ctx, m }) => {
      if (!z.string().safeParse(response).success) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: m("Invalid string") });
      }
    },
  }),
  address: defineFieldSchema<unknown, string>({
    preprocess: ({ response }) => stringifyResponse(response).trim(),
    superRefine: ({ response, ctx, m }) => {
      if (!z.string().safeParse(response).success) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: m("Invalid string") });
      }
    },
  }),
  number: defineFieldSchema<unknown, string>({
    preprocess: ({ response }) => stringifyResponse(response).trim(),
    superRefine: ({ response, ctx, m }) => {
      if (!z.string().safeParse(response).success) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: m("Invalid string") });
      }
    },
  }),
};

export type FieldZodCtx = {
  addIssue: (issue: z.IssueData) => void;
};
