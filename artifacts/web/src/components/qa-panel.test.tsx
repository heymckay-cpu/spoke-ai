import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mockGetToken = vi.fn();
type ClerkSessionLike = { getToken: typeof mockGetToken } | null;
const mockUseClerk = vi.fn<() => { session: ClerkSessionLike }>(() => ({
  session: { getToken: mockGetToken },
}));

const mockUseGetQaConversation = vi.fn(
  (_id: number, _opts?: unknown) => ({
    data: { messages: [] as unknown[] },
    isLoading: false,
  }),
);
const mockCreateMutateAsync = vi.fn(async () => ({ id: 42 }));
const mockUseCreateQaConversation = vi.fn(() => ({
  mutateAsync: mockCreateMutateAsync,
}));
const mockInvalidateQueries = vi.fn(async () => {});

vi.mock("@clerk/react", () => ({
  useClerk: () => mockUseClerk(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

vi.mock("@workspace/api-client-react", () => ({
  useGetQaConversation: (id: number, opts?: unknown) =>
    mockUseGetQaConversation(id, opts),
  useCreateQaConversation: () => mockUseCreateQaConversation(),
  getGetQaConversationQueryKey: (id: number) =>
    [`/api/qa/conversations/${id}`] as const,
}));

import { QaPanel } from "./qa-panel";

const originalFetch = globalThis.fetch;
const mockFetch = vi.fn();

beforeEach(() => {
  mockGetToken.mockReset();
  mockUseClerk.mockReset();
  mockUseClerk.mockReturnValue({
    session: { getToken: mockGetToken } as ClerkSessionLike,
  });
  mockCreateMutateAsync.mockClear();
  mockCreateMutateAsync.mockResolvedValue({ id: 42 });
  mockInvalidateQueries.mockClear();
  mockFetch.mockReset();
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  if (typeof window !== "undefined") {
    window.sessionStorage.clear();
  }
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function makeEmptyStreamResponse(): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

describe("QaPanel streaming auth header", () => {
  it("attaches the Clerk Bearer token to the streaming fetch when signed in", async () => {
    mockGetToken.mockResolvedValue("clerk-jwt-token");
    mockFetch.mockResolvedValue(makeEmptyStreamResponse());

    render(<QaPanel />);
    fireEvent.click(screen.getAllByTestId("qa-suggested-prompt")[0]);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/qa\/messages\/stream$/);
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer clerk-jwt-token");
    expect(headers["content-type"]).toBe("application/json");
    expect(mockGetToken).toHaveBeenCalled();
  });

  it("shows the sign-in error and does NOT fire the streaming request when no session token is available", async () => {
    mockUseClerk.mockReturnValue({ session: null });

    render(<QaPanel />);
    fireEvent.click(screen.getAllByTestId("qa-suggested-prompt")[0]);

    await waitFor(() => {
      expect(screen.getByTestId("qa-error")).toHaveTextContent(/sign in required/i);
    });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockGetToken).not.toHaveBeenCalled();
  });
});
