import { useAutoAnimate } from "@formkit/auto-animate/react";
import type { Key } from "react";
import { Controller, useFormContext } from "react-hook-form";
import type { SingleValue } from "react-select";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { ascendingLimitKeys, intervalLimitKeyToUnit } from "@calcom/lib/intervalLimits/intervalLimit";
import type { IntervalLimit } from "@calcom/lib/intervalLimits/intervalLimitSchema";
import classNames from "@calcom/ui/classNames";
import { Button } from "@calcom/ui/components/button";
import type { SelectClassNames } from "@calcom/ui/components/form";
import { Select, TextField } from "@calcom/ui/components/form";

type IntervalLimitsKey = keyof IntervalLimit;

const INTERVAL_LIMIT_OPTIONS = ascendingLimitKeys.map((key) => ({
    value: key as keyof IntervalLimit,
    label: `Per ${intervalLimitKeyToUnit(key)}`,
}));

export type IntervalLimitItemCustomClassNames = {
    addLimitButton?: string;
    limitText?: string;
    limitSelect?: Omit<SelectClassNames, "label" | "container">;
    container?: string;
};

type IntervalLimitItemProps = {
    limitKey: IntervalLimitsKey;
    step: number;
    value: number;
    textFieldSuffix?: string;
    disabled?: boolean;
    selectOptions: { value: keyof IntervalLimit; label: string }[];
    hasDeleteButton?: boolean;
    onDelete: (intervalLimitsKey: IntervalLimitsKey) => void;
    onLimitChange: (intervalLimitsKey: IntervalLimitsKey, limit: number) => void;
    onIntervalSelect: (interval: SingleValue<{ value: keyof IntervalLimit; label: string }>) => void;
    customClassNames?: IntervalLimitItemCustomClassNames;
};

const IntervalLimitItem = ({
    limitKey,
    step,
    value,
    textFieldSuffix,
    selectOptions,
    hasDeleteButton,
    disabled,
    onDelete,
    onLimitChange,
    onIntervalSelect,
    customClassNames,
}: IntervalLimitItemProps) => {
    return (
        <div
            data-testid="add-limit"
            className={classNames(
                "mb-4 flex w-full min-w-0 items-center gap-x-2 text-sm rtl:space-x-reverse",
                customClassNames?.container
            )}>
            <TextField
                required
                type="number"
                containerClassName={textFieldSuffix ? "w-32 sm:w-44 -mb-1 shrink" : "w-14 sm:w-16 mb-0 shrink"}
                className={classNames("mb-0", customClassNames?.limitText)}
                placeholder={`${value}`}
                disabled={disabled}
                min={step}
                step={step}
                defaultValue={value}
                addOnSuffix={textFieldSuffix}
                onChange={(e) => onLimitChange(limitKey, parseInt(e.target.value || "0", 10))}
            />
            <Select
                options={selectOptions}
                isSearchable={false}
                isDisabled={disabled}
                defaultValue={INTERVAL_LIMIT_OPTIONS.find((option) => option.value === limitKey)}
                onChange={onIntervalSelect}
                className={classNames("w-36", customClassNames?.limitSelect?.select)}
                innerClassNames={customClassNames?.limitSelect?.innerClassNames}
            />
            {hasDeleteButton && !disabled && (
                <Button
                    variant="icon"
                    StartIcon="trash-2"
                    color="destructive"
                    className={classNames("border-none", customClassNames?.addLimitButton)}
                    onClick={() => onDelete(limitKey)}
                />
            )}
        </div>
    );
};

type IntervalLimitsManagerProps<K extends string> = {
    propertyName: K;
    defaultLimit: number;
    step: number;
    textFieldSuffix?: string;
    disabled?: boolean;
    customClassNames?: IntervalLimitItemCustomClassNames;
};

export const IntervalLimitsManager = <K extends string>({
    propertyName,
    defaultLimit,
    step,
    textFieldSuffix,
    disabled,
    customClassNames,
}: IntervalLimitsManagerProps<K>) => {
    const { watch, setValue, control } = useFormContext<any>();
    const watchIntervalLimits = watch(propertyName);
    const { t } = useLocale();

    const [animateRef] = useAutoAnimate<HTMLUListElement>();

    return (
        <Controller
            name={propertyName}
            control={control}
            render={({ field: { value, onChange } }) => {
                const currentIntervalLimits = value as IntervalLimit;

                const addLimit = () => {
                    if (!currentIntervalLimits || !watchIntervalLimits) return;
                    const currentKeys = Object.keys(watchIntervalLimits);

                    const [rest] = Object.values(INTERVAL_LIMIT_OPTIONS).filter(
                        (option) => !currentKeys.includes(option.value)
                    );
                    if (!rest || !currentKeys.length) return;

                    setValue(
                        propertyName,
                        {
                            ...watchIntervalLimits,
                            [rest.value]: defaultLimit,
                        },
                        { shouldDirty: true }
                    );
                };

                return (
                    <ul ref={animateRef}>
                        {currentIntervalLimits &&
                            watchIntervalLimits &&
                            Object.entries(currentIntervalLimits)
                                .sort(([limitKeyA], [limitKeyB]) => {
                                    return (
                                        ascendingLimitKeys.indexOf(limitKeyA as IntervalLimitsKey) -
                                        ascendingLimitKeys.indexOf(limitKeyB as IntervalLimitsKey)
                                    );
                                })
                                .map(([key, value]) => {
                                    const limitKey = key as IntervalLimitsKey;
                                    return (
                                        <IntervalLimitItem
                                            key={key}
                                            limitKey={limitKey}
                                            step={step}
                                            value={value as number}
                                            disabled={disabled}
                                            textFieldSuffix={textFieldSuffix}
                                            hasDeleteButton={Object.keys(currentIntervalLimits).length > 1}
                                            selectOptions={INTERVAL_LIMIT_OPTIONS.filter(
                                                (option) => !Object.keys(currentIntervalLimits).includes(option.value)
                                            )}
                                            onLimitChange={(intervalLimitKey, val) =>
                                                setValue(`${propertyName}.${intervalLimitKey}`, val, { shouldDirty: true })
                                            }
                                            onDelete={(intervalLimitKey) => {
                                                const current = { ...currentIntervalLimits };
                                                delete current[intervalLimitKey];
                                                onChange(current);
                                            }}
                                            onIntervalSelect={(interval) => {
                                                const current = { ...currentIntervalLimits };
                                                const currentValue = watchIntervalLimits[limitKey];

                                                delete current[limitKey];
                                                const newData = {
                                                    ...current,
                                                    [interval?.value as IntervalLimitsKey]: currentValue,
                                                };
                                                onChange(newData);
                                            }}
                                            customClassNames={customClassNames}
                                        />
                                    );
                                })}
                        {currentIntervalLimits && Object.keys(currentIntervalLimits).length < INTERVAL_LIMIT_OPTIONS.length && !disabled && (
                            <Button color="minimal" StartIcon="plus" onClick={addLimit} className="mt-2">
                                {t("add_limit")}
                            </Button>
                        )}
                    </ul>
                );
            }}
        />
    );
};
