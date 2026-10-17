/**
 * The Standard Schema v1 interface (https://standardschema.dev), inlined so the
 * package has no runtime or type dependency. Zod (3.24+), Valibot (1.0+), ArkType
 * (2.0+), Effect Schema and others implement it, so their schemas are accepted as is.
 */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': StandardSchemaProps<Input, Output>;
}

export interface StandardSchemaProps<Input = unknown, Output = Input> {
  readonly version: 1;
  readonly vendor: string;
  readonly validate: (value: unknown) => StandardSchemaResult<Output> | Promise<StandardSchemaResult<Output>>;
  readonly types?: StandardSchemaTypes<Input, Output> | undefined;
}

export type StandardSchemaResult<Output> = StandardSchemaSuccess<Output> | StandardSchemaFailure;

export interface StandardSchemaSuccess<Output> {
  readonly value: Output;
  readonly issues?: undefined;
}

export interface StandardSchemaFailure {
  readonly issues: readonly StandardSchemaIssue[];
}

export interface StandardSchemaIssue {
  readonly message: string;
  readonly path?: readonly (PropertyKey | StandardSchemaPathSegment)[] | undefined;
}

export interface StandardSchemaPathSegment {
  readonly key: PropertyKey;
}

export interface StandardSchemaTypes<Input = unknown, Output = Input> {
  readonly input: Input;
  readonly output: Output;
}

/** The type a Standard Schema produces. */
export type InferSchemaOutput<Schema extends StandardSchemaV1> = NonNullable<Schema['~standard']['types']>['output'];
