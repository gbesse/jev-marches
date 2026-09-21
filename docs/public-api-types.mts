// Purpose: Ensure the public package declaration can be consumed by TypeScript.
import * as api from "../src/index.mjs";
import { createFakeProvider } from "../src/jev.mjs";
void api;
void createFakeProvider;
