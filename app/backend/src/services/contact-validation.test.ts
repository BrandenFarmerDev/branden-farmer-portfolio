import { describe, expect, it } from "vitest";
import { validateContactRequest } from "./contact-validation";

const validContact = {
  submissionId: "123e4567-e89b-42d3-a456-426614174000",
  name: "Branden Visitor",
  email: "visitor@example.com",
  company: "Example Company",
  position: "Application Developer",
  message: "I would like to discuss an application development role.",
  turnstileToken: "valid-test-token",
};

describe("validateContactRequest", () => {
  it("normalizes and accepts a valid contact request", () => {
    const result = validateContactRequest({
      ...validContact,
      name: "  Branden Visitor  ",
      email: "  VISITOR@EXAMPLE.COM  ",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Branden Visitor");
      expect(result.data.email).toBe("visitor@example.com");
    }
  });

  it("returns field errors for missing or invalid values", () => {
    const result = validateContactRequest({
      submissionId: "not-a-uuid",
      name: "A",
      email: "not-an-email",
      company: "x".repeat(121),
      position: "",
      message: "Too short",
      turnstileToken: "",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors).toMatchObject({
        name: expect.any(String),
        email: expect.any(String),
        company: expect.any(String),
        position: expect.any(String),
        message: expect.any(String),
        turnstileToken: expect.any(String),
      });
    }
  });

  it("requires both company and position", () => {
    const result = validateContactRequest({
      ...validContact,
      company: "",
      position: "",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors.company).toBeDefined();
      expect(result.fieldErrors.position).toBeDefined();
    }
  });

  it("rejects control characters in email header fields", () => {
    const result = validateContactRequest({
      ...validContact,
      name: "Visitor\nBcc: attacker@example.com",
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.fieldErrors.name).toBeDefined();
  });
});
