import {parseBoolean, parseInterval, parseNumber, parseObject} from "../parsers";
import {
    ConfigValue,
    ConfigValueType,
    PublicArrayResolverInterface,
    PublicCoreResolverInterface,
    Validator
} from "../types/config";
import {ArrayResolver} from "./array";

export class CoreResolver<T extends ConfigValue = string> implements PublicCoreResolverInterface<T> {
    public readonly defaultValue: ConfigValue | ConfigValue[] | undefined;
    public readonly envKey: string;
    readonly envValue: string|null;
    public readonly isSecret: boolean;
    public type: ConfigValueType|null = null;
    private buildErrors: string[] = [];
    private parsedValue: ConfigValue|null = null;
    private parsed = false;
    public validator: Validator = () => true;
    public validatorName = "";

    constructor(envKey: string, defaultValue: ConfigValue|ConfigValue[]|undefined, isSecret: boolean) {
        this.envKey = envKey;
        this.envValue = process.env[envKey] !== undefined ? `${process.env[envKey]}` : null;
        this.defaultValue = defaultValue;
        this.isSecret = isSecret;
    }

    private setType(type: ConfigValueType) {
        if (this.type !== null) {
            this.buildErrors.push(`A type of "${this.type}" as already been specified.`);
            return;
        }

        this.type = type;
    }

    private validateDefaultValue(): void {
        if (this.defaultValue === null) {
            return;
        }

        let expectedType = "string";

        switch (this.type) {
        case ConfigValueType.NUMBER: expectedType = "number"; break;
        case ConfigValueType.OBJECT: expectedType = "object"; break;
        case ConfigValueType.BOOLEAN: expectedType = "boolean"; break;
        }

        if (typeof this.defaultValue !== expectedType) {
            this.buildErrors.push(
                `Expected default value to be of type ${this.type} but received ${typeof this.defaultValue}`
            );
        }
    }

    public build(): void {
        if (this.parsed) {
            return;
        }

        const setAndValidateParsedValue = (value: ConfigValue): void => {
            this.parsedValue = value;
            if (!this.validator(this.parsedValue)) {
                this.buildErrors.push(`Value did not pass validator check for ${this.validatorName}`);
            } else {
                this.parsed = true;
            }
        };

        if (this.envValue === null) {
            if (typeof this.defaultValue !== "undefined") {
                this.validateDefaultValue();
            } else {
                this.buildErrors.push(
                    `No environment variable found for ${this.envKey} and no default value specified.`
                );
            }

            return;
        }

        let parsed;

        switch (this.type) {
        case ConfigValueType.BOOLEAN: parsed = parseBoolean(this.envValue, this.isSecret); break;
        case ConfigValueType.NUMBER: parsed = parseNumber(this.envValue, this.isSecret); break;
        case ConfigValueType.OBJECT: parsed = parseObject(this.envValue, this.isSecret); break;
        case ConfigValueType.INTERVAL: parsed = parseInterval(this.envValue, this.isSecret); break;
        default: return setAndValidateParsedValue(this.envValue);
        }

        if (typeof parsed === "string") {
            this.buildErrors.push(parsed);
            return;
        }

        return setAndValidateParsedValue(parsed);
    }

    public get parsedEnvValue(): ConfigValue {
        return this.parsedValue;
    }

    public value(): T {
        return (this.parsed ? this.parsedEnvValue : this.defaultValue) as T;
    }

    public get logValue(): ConfigValue|ConfigValue[] {
        return this.isSecret ? "****" : this.value();
    }

    public asInterval(): PublicCoreResolverInterface<number> {
        this.setType(ConfigValueType.INTERVAL);
        return this as CoreResolver<number>;
    }

    public asNumber(): PublicCoreResolverInterface<number> {
        this.setType(ConfigValueType.NUMBER);
        return this as CoreResolver<number>;
    }

    public asBoolean(): PublicCoreResolverInterface<boolean> {
        this.setType(ConfigValueType.BOOLEAN);
        return this as CoreResolver<boolean>;
    }

    public asObject<OT extends Record<string, unknown>>(): PublicCoreResolverInterface<OT> {
        this.setType(ConfigValueType.OBJECT);
        return this as CoreResolver<OT>;
    }

    public asArray(splitOn = ","): PublicArrayResolverInterface {
        if (![null, ConfigValueType.STRING].includes(this.type)) {
            this.buildErrors.push(`Can only convert string values to array, but ${this.type} was specified.`);
        }
        return new ArrayResolver(this as CoreResolver, splitOn);
    }

    public getBuildErrors(): string[] {
        return this.buildErrors;
    }

    public validate({name, fn}: {name: string, fn: Validator}): PublicCoreResolverInterface<T> {
        this.validator = fn;
        this.validatorName = name;
        return this;
    }
}
