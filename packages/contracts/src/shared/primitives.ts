import { z } from "zod";

export const identifierSchema = z.uuid();
export const instantSchema = z.iso.datetime({ precision: 3 });
export const dateOnlySchema = z.iso.date();
export const decimalSchema = z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/);

export type Identifier = z.infer<typeof identifierSchema>;
