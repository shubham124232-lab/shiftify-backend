"use strict";
// Seed script — creates SUPER_ADMIN + one test user per role (multi-role identity model).
// Run with: npm run seed
// Idempotent: re-running is safe (upserts on email, or username for managed accounts).
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const client_1 = require("@prisma/client");
const bcrypt_1 = __importDefault(require("bcrypt"));
const prisma = new client_1.PrismaClient();
async function hash(p) {
    return bcrypt_1.default.hash(p, 10);
}
const DEFAULT_PASSWORD = "Password@123";
async function main() {
    const adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@shiftify.local";
    const adminPassword = process.env.SEED_ADMIN_PASSWORD || "Admin@123";
    const adminName = process.env.SEED_ADMIN_NAME || "Shiftify Admin";
    console.log("[seed] Creating SUPER_ADMIN...");
    const admin = await prisma.user.upsert({
        where: { email: adminEmail.toLowerCase() },
        update: {},
        create: {
            email: adminEmail.toLowerCase(),
            passwordHash: await hash(adminPassword),
            name: adminName,
            accountType: "SELF",
            adminTier: "SUPER_ADMIN",
            status: "ACTIVE",
            emailVerified: true,
            roles: { create: { role: "ADMIN", isActiveDefault: true } },
        },
    });
    console.log(`  ✓ admin: ${admin.email}`);
    console.log("[seed] Creating test users...");
    // PARTICIPANT — also holds a SUPPORT_WORKER role to demo multi-role switching.
    const participant = await prisma.user.upsert({
        where: { email: "alice.participant@shiftify.local" },
        update: {},
        create: {
            email: "alice.participant@shiftify.local",
            phone: "+61400000001",
            passwordHash: await hash(DEFAULT_PASSWORD),
            name: "Alice Participant",
            accountType: "SELF",
            status: "ACTIVE",
            emailVerified: true,
            defaultSuburb: "Footscray",
            defaultState: "VIC",
            defaultPostcode: "3011",
            roles: {
                create: [
                    { role: "PARTICIPANT", isActiveDefault: true },
                    { role: "SUPPORT_WORKER" }, // multi-role demo: Alice can switch hats
                ],
            },
            participantProfile: {
                create: {
                    preferredName: "Alice",
                    ageGroup: "Adult",
                    gender: "Female",
                    ndisNumber: "TEST-43011234",
                    fundingManagementType: "PLAN",
                    primaryDisability: "Physical disability",
                    riskSafetyNotes: "Falls risk — please assist with transfers.",
                },
            },
            address: {
                create: {
                    street: "12 Barkly Street",
                    suburb: "Footscray",
                    state: "VIC",
                    postcode: "3011",
                },
            },
        },
    });
    console.log(`  ✓ participant: ${participant.email}`);
    // SUPPORT_WORKER (solo, self-registered)
    const worker = await prisma.user.upsert({
        where: { email: "bob.worker@shiftify.local" },
        update: {},
        create: {
            email: "bob.worker@shiftify.local",
            phone: "+61400000002",
            passwordHash: await hash(DEFAULT_PASSWORD),
            name: "Bob Worker",
            accountType: "SELF",
            status: "ACTIVE",
            emailVerified: true,
            defaultSuburb: "Sunshine",
            defaultState: "VIC",
            defaultPostcode: "3020",
            roles: { create: { role: "SUPPORT_WORKER", isActiveDefault: true } },
            workerProfile: {
                create: {
                    gender: "Male",
                    rightToWork: "CITIZEN",
                    workType: "CONTRACTOR",
                    servicesOffered: ["PERSONAL_CARE", "COMMUNITY_ACCESS", "TRANSPORT"],
                    experienceLevel: "EXPERIENCED",
                    availabilityType: "CASUAL",
                    travelRadiusKm: 20,
                    hasVehicle: true,
                    insuranceValid: true,
                    hourlyRate: 45,
                    bio: "Solo support worker available for personal care and community access.",
                    isAvailableNow: true,
                },
            },
            address: {
                create: {
                    street: "5 Hampshire Road",
                    suburb: "Sunshine",
                    state: "VIC",
                    postcode: "3020",
                },
            },
        },
    });
    console.log(`  ✓ worker: ${worker.email}`);
    // PROVIDER
    const provider = await prisma.user.upsert({
        where: { email: "carepartners@shiftify.local" },
        update: {},
        create: {
            email: "carepartners@shiftify.local",
            phone: "+61399990001",
            passwordHash: await hash(DEFAULT_PASSWORD),
            name: "Care Partners Admin",
            accountType: "SELF",
            status: "ACTIVE",
            emailVerified: true,
            defaultSuburb: "Melbourne",
            defaultState: "VIC",
            defaultPostcode: "3000",
            roles: { create: { role: "PROVIDER", isActiveDefault: true } },
            providerProfile: {
                create: {
                    businessName: "Care Partners",
                    legalEntityName: "Care Partners Pty Ltd",
                    abn: "12345678901",
                    businessStructure: "COMPANY",
                    ndisRegistered: true,
                    ndisProviderNumber: "4050001234",
                    yearsInOperation: "3-5",
                    primaryContactName: "Care Partners Admin",
                    primaryContactRole: "Director",
                    primaryContactPhone: "+61399990001",
                    primaryContactEmail: "carepartners@shiftify.local",
                    coreServices: ["PERSONAL_CARE", "COMMUNITY_ACCESS", "OVERNIGHT_SUPPORT"],
                    offersSil: true,
                    serviceMode: "IN_PERSON",
                    workforceSize: "10-50",
                    billingMethod: "Via Plan Manager",
                    businessDescription: "Registered NDIS provider serving inner-west Melbourne.",
                },
            },
            address: {
                create: {
                    street: "100 Collins Street",
                    suburb: "Melbourne",
                    state: "VIC",
                    postcode: "3000",
                },
            },
        },
    });
    console.log(`  ✓ provider: ${provider.email}`);
    // Provider's worker — a MANAGED account: logs in by username, no email/phone, parent-owned.
    const providerWorker = await prisma.user.upsert({
        where: { username: "dana.worker" },
        update: {},
        create: {
            username: "dana.worker",
            passwordHash: await hash(DEFAULT_PASSWORD),
            name: "Dana Worker",
            accountType: "MANAGED",
            status: "ACTIVE",
            parentUserId: provider.id,
            defaultSuburb: "Melbourne",
            defaultState: "VIC",
            defaultPostcode: "3000",
            roles: { create: { role: "SUPPORT_WORKER", isActiveDefault: true } },
            workerProfile: {
                create: {
                    gender: "Female",
                    rightToWork: "CITIZEN",
                    workType: "AGENCY",
                    servicesOffered: ["PERSONAL_CARE", "OVERNIGHT_SUPPORT"],
                    experienceLevel: "EXPERIENCED",
                    availabilityType: "PART_TIME",
                    travelRadiusKm: 15,
                    hourlyRate: 42,
                    bio: "Employed by Care Partners. Available for assigned shifts.",
                },
            },
            address: {
                create: {
                    street: "8 Lygon Street",
                    suburb: "Carlton",
                    state: "VIC",
                    postcode: "3053",
                },
            },
        },
    });
    console.log(`  ✓ provider-worker (managed): ${providerWorker.username}`);
    // COORDINATOR
    const coordinator = await prisma.user.upsert({
        where: { email: "claire.coord@shiftify.local" },
        update: {},
        create: {
            email: "claire.coord@shiftify.local",
            phone: "+61400000005",
            passwordHash: await hash(DEFAULT_PASSWORD),
            name: "Claire Coordinator",
            accountType: "SELF",
            status: "ACTIVE",
            emailVerified: true,
            defaultSuburb: "Brunswick",
            defaultState: "VIC",
            defaultPostcode: "3056",
            roles: { create: { role: "COORDINATOR", isActiveDefault: true } },
            coordinatorProfile: {
                create: {
                    roleType: "INDEPENDENT",
                    abn: "98765432109",
                    ndisRegistered: true,
                    ndisProviderNumber: "4050005678",
                    yearsExperience: "3-5",
                    supportCoordinationLevel: ["Support Coordination (Level 2)"],
                    serviceMode: "BOTH",
                    currentCapacityStatus: "Accepting New Participants",
                    maxParticipantLoad: 25,
                    participantTypesAccepted: ["Plan-managed", "Self-managed"],
                    billingMethodPreference: "Through plan manager",
                    bio: "Independent support coordinator covering inner-north Melbourne.",
                },
            },
            address: {
                create: {
                    street: "32 Sydney Road",
                    suburb: "Brunswick",
                    state: "VIC",
                    postcode: "3056",
                },
            },
        },
    });
    console.log(`  ✓ coordinator: ${coordinator.email}`);
    // PLAN_MANAGER
    const planMgr = await prisma.user.upsert({
        where: { email: "pm@shiftify.local" },
        update: {},
        create: {
            email: "pm@shiftify.local",
            phone: "+61399990002",
            passwordHash: await hash(DEFAULT_PASSWORD),
            name: "Pat Plan-Manager",
            accountType: "SELF",
            status: "ACTIVE",
            emailVerified: true,
            defaultSuburb: "Richmond",
            defaultState: "VIC",
            defaultPostcode: "3121",
            roles: { create: { role: "PLAN_MANAGER", isActiveDefault: true } },
            planManagerProfile: {
                create: {
                    businessName: "Plan Manager Co",
                    abn: "11122233344",
                    ndisRegistered: true,
                    yearsInOperation: "5+",
                },
            },
            address: {
                create: {
                    street: "200 Bridge Road",
                    suburb: "Richmond",
                    state: "VIC",
                    postcode: "3121",
                },
            },
        },
    });
    console.log(`  ✓ plan manager: ${planMgr.email}`);
    console.log("");
    console.log("[seed] Done. Login credentials (dev only):");
    console.log(`  Admin            : ${adminEmail} / ${adminPassword}`);
    console.log(`  Participant      : alice.participant@shiftify.local / ${DEFAULT_PASSWORD}  (also holds SUPPORT_WORKER)`);
    console.log(`  Worker (solo)    : bob.worker@shiftify.local / ${DEFAULT_PASSWORD}`);
    console.log(`  Provider         : carepartners@shiftify.local / ${DEFAULT_PASSWORD}`);
    console.log(`  Worker (managed) : username "dana.worker" / ${DEFAULT_PASSWORD}`);
    console.log(`  Coordinator      : claire.coord@shiftify.local / ${DEFAULT_PASSWORD}`);
    console.log(`  Plan Manager     : pm@shiftify.local / ${DEFAULT_PASSWORD}`);
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed.js.map