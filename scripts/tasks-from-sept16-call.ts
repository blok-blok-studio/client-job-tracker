import path from "node:path";
import { config as loadEnv } from "dotenv";

// Action items from the Chase x Bridget call on 16 September 2026.
//
//   npx tsx scripts/tasks-from-sept16-call.ts            dry run, writes nothing
//   npx tsx scripts/tasks-from-sept16-call.ts --apply    writes
//
// Written straight through Prisma rather than POST /api/tasks on purpose:
// SLACK_WEBHOOK_URL is configured, and that route fires a Slack message plus an
// in-app notification per task. Fourteen at once is noise nobody asked for, and
// a Slack message cannot be unsent. The trade is no ActivityLog rows for these.
//
// Idempotent: a task is skipped if one with the same title already exists for
// the same client. Every row is tagged so the whole batch can be found or
// removed - tags: ["meeting", "2026-09-16"].
//
// Client ids were read from the live database first (scripts/list-clients-and-users.ts).
// Note "Colter Staley" in the Fathom transcript is Colton Staley of Bronco
// Plumbing - the transcript mishears the name.

loadEnv({ path: path.join(process.cwd(), ".env.local") });
loadEnv({ path: path.join(process.cwd(), ".env") });

const APPLY = process.argv.includes("--apply");

const GRANT = "cmrukfwls000g93btgsyq1n2w"; // Grant Parkhurst
const RTP = "cmq1hgj7m00006idwm0rvmr7b"; // Heidie Haynes (RTP)
const AMIR = "cmmthnrfq00716ieezdj2yv8c"; // Amir Gomez
const COLTON = "cmoiz2fl2000486dy1cm0azo3"; // Colton Staley, Bronco Plumbing

const CHASE = "Chase";
const BRIDGET = "Bridget Perdomo";

const TAGS = ["meeting", "2026-09-16"];

type Spec = {
  clientId: string | null;
  title: string;
  description: string;
  assignedTo: string;
  category:
    | "GENERAL" | "CONTENT_CREATION" | "SOCIAL_MEDIA" | "CLIENT_COMMS"
    | "REPORTING" | "STRATEGY";
  priority: "URGENT" | "HIGH" | "MEDIUM" | "LOW";
  status?: "BACKLOG" | "TODO";
  dueDate?: string;
};

const TASKS: Spec[] = [
  // ---------------------------------------------------------------- Grant
  {
    clientId: GRANT,
    title: 'Revise the "wait for it" video - extend the clip to show the full landing',
    description: "Client feedback: the cut lands too early. Extend so the landing is actually on screen.",
    assignedTo: BRIDGET,
    category: "CONTENT_CREATION",
    priority: "HIGH",
  },
  {
    clientId: GRANT,
    title: 'Revise the "last run of the day" video - change the caption',
    description: "Client superstition about the phrase. Keep the edit, rewrite the caption.",
    assignedTo: BRIDGET,
    category: "CONTENT_CREATION",
    priority: "HIGH",
  },
  {
    clientId: GRANT,
    title: "Replace scam video 1 with a dynamic edit",
    description: "Client does not like the static style of the scam videos. Two of the six need replacing; this is the first.",
    assignedTo: BRIDGET,
    category: "CONTENT_CREATION",
    priority: "MEDIUM",
  },
  {
    clientId: GRANT,
    title: "Replace scam video 2 with a dynamic edit",
    description: "Second of the two scam videos to be redone in a dynamic style.",
    assignedTo: BRIDGET,
    category: "CONTENT_CREATION",
    priority: "MEDIUM",
  },
  {
    clientId: GRANT,
    title: "Grant's social pauses after this month - confirm the wind-down",
    description: "Agreed on the 16 Sep call. Confirm what the last deliverables are and what happens to the connected accounts.",
    assignedTo: CHASE,
    category: "CLIENT_COMMS",
    priority: "HIGH",
  },
  {
    clientId: GRANT,
    title: "Post Grant's content manually - no login access",
    description: "No direct login, so Bridget sends the calendar and Chase posts. Recurring until the pause takes effect.",
    assignedTo: CHASE,
    category: "SOCIAL_MEDIA",
    priority: "MEDIUM",
  },

  // ------------------------------------------------------------------ RTP
  {
    clientId: RTP,
    title: "Send the RTP content calendar to Chase",
    description: "Chase posts RTP by hand, so the calendar has to reach him rather than going into a scheduler.",
    assignedTo: BRIDGET,
    category: "SOCIAL_MEDIA",
    priority: "HIGH",
    dueDate: "2026-09-17",
  },
  {
    clientId: RTP,
    title: "Post RTP content manually - client security policy blocks logins",
    description: "The client will not hand over logins. Post from the calendar Bridget sends.",
    assignedTo: CHASE,
    category: "SOCIAL_MEDIA",
    priority: "MEDIUM",
  },

  // ----------------------------------------------------------------- Amir
  {
    clientId: AMIR,
    title: "Text Amir for login credentials so posting can go direct",
    description: "With credentials in the vault his posts can be scheduled instead of handed off.",
    assignedTo: BRIDGET,
    category: "CLIENT_COMMS",
    priority: "HIGH",
    dueDate: "2026-09-18",
  },

  // --------------------------------------------------------------- Colton
  {
    clientId: COLTON,
    title: "Post Colton's carousels",
    description: "Bridget has login access for this one, so she posts directly.",
    assignedTo: BRIDGET,
    category: "SOCIAL_MEDIA",
    priority: "MEDIUM",
  },
  {
    clientId: COLTON,
    title: "Discuss October video content with Colton",
    description: "Agreed on the 16 Sep call that Chase would raise October video with him.",
    assignedTo: CHASE,
    category: "CLIENT_COMMS",
    priority: "HIGH",
    dueDate: "2026-09-18",
  },

  // ------------------------------------------------------------- no client
  {
    clientId: null,
    title: "Finalise and send all client content calendars to Chase",
    description: "All clients, in one pass. Chase is posting for RTP and Grant, so he cannot start until these land.",
    assignedTo: BRIDGET,
    category: "CLIENT_COMMS",
    priority: "URGENT",
    dueDate: "2026-09-17",
  },
  {
    clientId: null,
    title: "Send the remaining emails from the current lead list",
    description: "Finish the list that is already built. Generating new 50-company lists is paused until CES and China planning is done.",
    assignedTo: BRIDGET,
    category: "GENERAL",
    priority: "LOW",
  },
  {
    clientId: null,
    title: "CES and China prep is tracked in Blok Blok OS",
    description:
      "Pointer, not a task. The trip itinerary, the CES deadlines, the visa and the phone question all live at https://blokblok-os.vercel.app - not on this board.",
    assignedTo: CHASE,
    category: "GENERAL",
    priority: "LOW",
    status: "BACKLOG",
  },
];

async function main() {
  const { default: prisma } = await import("../src/lib/prisma");

  console.log(APPLY ? "APPLYING" : "DRY RUN - nothing will be written");

  let created = 0;
  let skipped = 0;

  for (const spec of TASKS) {
    const existing = await prisma.task.findFirst({
      where: { title: spec.title, clientId: spec.clientId },
      select: { id: true },
    });
    if (existing) {
      skipped += 1;
      continue;
    }

    console.log(`  ${APPLY ? "CREATE" : "would create"}  [${spec.assignedTo}] ${spec.title}`);
    created += 1;

    if (APPLY) {
      await prisma.task.create({
        data: {
          clientId: spec.clientId,
          title: spec.title,
          description: spec.description,
          status: spec.status ?? "TODO",
          priority: spec.priority,
          category: spec.category,
          assignedTo: spec.assignedTo,
          dueDate: spec.dueDate ? new Date(`${spec.dueDate}T12:00:00.000Z`) : null,
          tags: TAGS,
        },
      });
    }
  }

  console.log(`\n${created} to create, ${skipped} already there${APPLY ? "" : " - re-run with --apply"}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
