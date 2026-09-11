import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library only auto-registers cleanup when Vitest globals are
// enabled. This project imports test helpers explicitly, so without this
// the DOM accumulates across tests and queries match multiple elements.
afterEach(cleanup);
