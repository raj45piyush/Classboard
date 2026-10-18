import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const rules = readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8");

describe("Firestore admin statistics rule contract", () => {
  it("keeps admin authorization tied to a trusted claim, verified email, and active profile", () => {
    const adminPredicate = rules.match(/function isAdmin\(\)\s*\{([\s\S]*?)\n\s*\}/)?.[1] ?? "";
    expect(adminPredicate).toContain("request.auth.token.role == 'admin'");
    expect(adminPredicate).toContain("request.auth.token.email_verified == true");
    expect(adminPredicate).toContain("userDoc(request.auth.uid).data.role == 'admin'");
    expect(adminPredicate).toContain("userDoc(request.auth.uid).data.status == 'active'");
  });

  it("allows admins to edit limited fields and change status only on other teacher profiles", () => {
    const adminUpdate = rules.match(/function validAdminTeacherProfileUpdate\(uid\)\s*\{([\s\S]*?)\n\s*\}/)?.[1] ?? "";
    expect(adminUpdate).toContain("isAdmin()");
    expect(adminUpdate).toContain("uid != request.auth.uid");
    expect(adminUpdate).toContain("resource.data.role == 'teacher'");
    expect(adminUpdate).toContain("'displayName', 'phoneNumber', 'updatedAt', 'status'");
    expect(adminUpdate).toContain("request.resource.data.role == resource.data.role");
    expect(adminUpdate).toContain("['active', 'disabled']");
    expect(adminUpdate).not.toContain("'email'");
  });

  it("keeps self-registration teacher-only and prevents client role/status updates", () => {
    const usersRule = rules.match(/match \/users\/\{uid\}\s*\{([\s\S]*?)\n\s*\}/)?.[1] ?? "";
    expect(usersRule).toContain("validNewTeacherProfile(uid)");
    expect(usersRule).toContain("validTeacherProfileUpdate(uid) || validAdminTeacherProfileUpdate(uid)");
    expect(rules).toContain("request.resource.data.role == 'teacher'");
    expect(rules).toContain("request.resource.data.status == 'active'");
  });

  it("allows only admins through the recursive members rule needed by collection-group stats", () => {
    const recursiveMembersRule = rules.match(/match \/\{path=\*\*\}\/members\/\{memberId\}\s*\{([\s\S]*?)\n\s*\}/)?.[1] ?? "";
    expect(recursiveMembersRule).toContain("allow read: if isAdmin();");
    expect(recursiveMembersRule).not.toMatch(/allow\s+(?:create|update|delete|write)/);
  });

  it("retains the classroom member self/owner rules and denies client writes by default", () => {
    expect(rules).toContain("request.auth.uid == memberId || isActiveTeacher(classroomOwner(classroomId)) || isAdmin()");
    expect(rules).toContain("allow delete: if false;");
  });
});
