export const CHURCH_VOLUNTEER_DEFAULT_TEMPLATE_KEY = "church_volunteer_default";

export const CHURCH_VOLUNTEER_DEFAULT_FORM = {
  slug: "general-serving",
  name: "Volunteer Interest",
  description: "Let us know where you may be interested in serving.",
  introText:
    "Thank you for wanting to serve. Share a little about yourself and where you'd like to help — we'll follow up with you soon.",
  successMessage:
    "Thank you! Your interest has been submitted. Someone from the church will follow up with you soon.",
  templateKey: CHURCH_VOLUNTEER_DEFAULT_TEMPLATE_KEY
};

export type TemplateServingArea = {
  slug: string;
  name: string;
  category: string;
  description: string;
  publicNote: string | null;
  requiresBackgroundCheck: boolean;
  requiresTraining: boolean;
  requiresAuditionOrInterview: boolean;
  sortOrder: number;
};

export type TemplateRequirement = {
  servingAreaSlug: string;
  requirementType: string;
  label: string;
  description: string | null;
  dayOfWeek: string | null;
  startTime: string | null;
  endTime: string | null;
  isMandatory: boolean;
  requiresConfirmation: boolean;
  sortOrder: number;
};

export const CHURCH_VOLUNTEER_DEFAULT_SERVING_AREAS: TemplateServingArea[] = [
  {
    slug: "worship-singer",
    name: "Worship Team / Singer",
    category: "worship",
    description: "Help lead the church in worship through singing.",
    publicNote:
      "This role may require rehearsal availability and an audition or conversation with the worship leader.",
    requiresBackgroundCheck: false,
    requiresTraining: false,
    requiresAuditionOrInterview: true,
    sortOrder: 10
  },
  {
    slug: "bass-player",
    name: "Bass Player",
    category: "worship",
    description: "Serve with the worship team as a bass player.",
    publicNote:
      "This role may require rehearsal availability and an audition or conversation with the worship leader.",
    requiresBackgroundCheck: false,
    requiresTraining: false,
    requiresAuditionOrInterview: true,
    sortOrder: 20
  },
  {
    slug: "other-instrumentalist",
    name: "Other Instrumentalist",
    category: "worship",
    description: "Serve with the worship team using another instrument.",
    publicNote:
      "This role may require rehearsal availability and an audition or conversation with the worship leader.",
    requiresBackgroundCheck: false,
    requiresTraining: false,
    requiresAuditionOrInterview: true,
    sortOrder: 30
  },
  {
    slug: "slides",
    name: "Slides",
    category: "media_tech",
    description: "Run worship lyrics, sermon slides, and other presentation elements.",
    publicNote: "Training may be provided before serving independently.",
    requiresBackgroundCheck: false,
    requiresTraining: true,
    requiresAuditionOrInterview: false,
    sortOrder: 40
  },
  {
    slug: "sound",
    name: "Sound",
    category: "media_tech",
    description: "Help with audio setup and live sound during services or events.",
    publicNote: "Training may be provided before serving independently.",
    requiresBackgroundCheck: false,
    requiresTraining: true,
    requiresAuditionOrInterview: false,
    sortOrder: 50
  },
  {
    slug: "camera-livestream",
    name: "Camera / Livestream",
    category: "media_tech",
    description: "Help operate cameras or livestream equipment for services.",
    publicNote: "This role is usually connected to Sunday morning services.",
    requiresBackgroundCheck: false,
    requiresTraining: true,
    requiresAuditionOrInterview: false,
    sortOrder: 60
  },
  {
    slug: "kids-ministry",
    name: "Kids Ministry",
    category: "kids_youth",
    description: "Serve children and families through kids ministry.",
    publicNote: "This role requires a background check before serving.",
    requiresBackgroundCheck: true,
    requiresTraining: true,
    requiresAuditionOrInterview: false,
    sortOrder: 70
  },
  {
    slug: "youth-ministry",
    name: "Youth Ministry",
    category: "kids_youth",
    description: "Serve students through youth ministry gatherings and events.",
    publicNote:
      "This role usually requires Wednesday night availability and a background check.",
    requiresBackgroundCheck: true,
    requiresTraining: true,
    requiresAuditionOrInterview: false,
    sortOrder: 80
  },
  {
    slug: "greeting-hospitality",
    name: "Greeting / Hospitality",
    category: "hospitality",
    description: "Welcome people and help create a warm Sunday experience.",
    publicNote: null,
    requiresBackgroundCheck: false,
    requiresTraining: false,
    requiresAuditionOrInterview: false,
    sortOrder: 90
  },
  {
    slug: "setup-cleanup",
    name: "Setup / Cleanup",
    category: "general",
    description: "Help prepare spaces before services or events and reset them afterward.",
    publicNote: null,
    requiresBackgroundCheck: false,
    requiresTraining: false,
    requiresAuditionOrInterview: false,
    sortOrder: 100
  },
  {
    slug: "events-special-events",
    name: "Events / Special Events",
    category: "events",
    description: "Help with occasional church events and special gatherings.",
    publicNote: "Special events may be outside the normal serving rhythm.",
    requiresBackgroundCheck: false,
    requiresTraining: false,
    requiresAuditionOrInterview: false,
    sortOrder: 110
  },
  {
    slug: "prayer-ministry-team",
    name: "Prayer / Ministry Team",
    category: "prayer_ministry",
    description: "Pray with and care for people during ministry moments.",
    publicNote:
      "This role may involve training or a conversation with church leadership.",
    requiresBackgroundCheck: false,
    requiresTraining: true,
    requiresAuditionOrInterview: false,
    sortOrder: 120
  }
];

export const CHURCH_VOLUNTEER_DEFAULT_REQUIREMENTS: TemplateRequirement[] = [
  {
    servingAreaSlug: "worship-singer",
    requirementType: "rehearsal",
    label: "Rehearsal availability",
    description:
      "This role may require rehearsal availability in addition to Sunday service.",
    dayOfWeek: null,
    startTime: null,
    endTime: null,
    isMandatory: true,
    requiresConfirmation: true,
    sortOrder: 10
  },
  {
    servingAreaSlug: "worship-singer",
    requirementType: "audition_or_interview",
    label: "Worship leader conversation",
    description: "A worship leader may follow up before scheduling this role.",
    dayOfWeek: null,
    startTime: null,
    endTime: null,
    isMandatory: true,
    requiresConfirmation: true,
    sortOrder: 20
  },
  {
    servingAreaSlug: "bass-player",
    requirementType: "rehearsal",
    label: "Rehearsal availability",
    description:
      "This role may require rehearsal availability in addition to Sunday service.",
    dayOfWeek: null,
    startTime: null,
    endTime: null,
    isMandatory: true,
    requiresConfirmation: true,
    sortOrder: 10
  },
  {
    servingAreaSlug: "bass-player",
    requirementType: "audition_or_interview",
    label: "Worship leader conversation",
    description: "A worship leader may follow up before scheduling this role.",
    dayOfWeek: null,
    startTime: null,
    endTime: null,
    isMandatory: true,
    requiresConfirmation: true,
    sortOrder: 20
  },
  {
    servingAreaSlug: "other-instrumentalist",
    requirementType: "rehearsal",
    label: "Rehearsal availability",
    description:
      "This role may require rehearsal availability in addition to Sunday service.",
    dayOfWeek: null,
    startTime: null,
    endTime: null,
    isMandatory: true,
    requiresConfirmation: true,
    sortOrder: 10
  },
  {
    servingAreaSlug: "other-instrumentalist",
    requirementType: "audition_or_interview",
    label: "Worship leader conversation",
    description: "A worship leader may follow up before scheduling this role.",
    dayOfWeek: null,
    startTime: null,
    endTime: null,
    isMandatory: true,
    requiresConfirmation: true,
    sortOrder: 20
  },
  {
    servingAreaSlug: "slides",
    requirementType: "training",
    label: "Slides training",
    description: "Training may be provided before serving independently.",
    dayOfWeek: null,
    startTime: null,
    endTime: null,
    isMandatory: false,
    requiresConfirmation: false,
    sortOrder: 10
  },
  {
    servingAreaSlug: "sound",
    requirementType: "training",
    label: "Sound training",
    description: "Training may be provided before serving independently.",
    dayOfWeek: null,
    startTime: null,
    endTime: null,
    isMandatory: false,
    requiresConfirmation: false,
    sortOrder: 10
  },
  {
    servingAreaSlug: "camera-livestream",
    requirementType: "availability",
    label: "Sunday morning availability",
    description:
      "Camera and livestream roles are usually connected to Sunday morning services.",
    dayOfWeek: "sunday",
    startTime: null,
    endTime: null,
    isMandatory: true,
    requiresConfirmation: true,
    sortOrder: 10
  },
  {
    servingAreaSlug: "camera-livestream",
    requirementType: "training",
    label: "Camera/livestream training",
    description: "Training may be provided before serving independently.",
    dayOfWeek: null,
    startTime: null,
    endTime: null,
    isMandatory: false,
    requiresConfirmation: false,
    sortOrder: 20
  },
  {
    servingAreaSlug: "kids-ministry",
    requirementType: "background_check",
    label: "Background check required",
    description: "Kids Ministry requires a background check before serving.",
    dayOfWeek: null,
    startTime: null,
    endTime: null,
    isMandatory: true,
    requiresConfirmation: true,
    sortOrder: 10
  },
  {
    servingAreaSlug: "kids-ministry",
    requirementType: "training",
    label: "Kids Ministry training",
    description: "Training may be required before serving independently.",
    dayOfWeek: null,
    startTime: null,
    endTime: null,
    isMandatory: false,
    requiresConfirmation: false,
    sortOrder: 20
  },
  {
    servingAreaSlug: "youth-ministry",
    requirementType: "availability",
    label: "Wednesday night availability",
    description: "Youth Ministry usually meets on Wednesday nights.",
    dayOfWeek: "wednesday",
    startTime: null,
    endTime: null,
    isMandatory: true,
    requiresConfirmation: true,
    sortOrder: 10
  },
  {
    servingAreaSlug: "youth-ministry",
    requirementType: "background_check",
    label: "Background check required",
    description: "Youth Ministry requires a background check before serving.",
    dayOfWeek: null,
    startTime: null,
    endTime: null,
    isMandatory: true,
    requiresConfirmation: true,
    sortOrder: 20
  },
  {
    servingAreaSlug: "youth-ministry",
    requirementType: "training",
    label: "Youth Ministry training",
    description: "Training may be required before serving independently.",
    dayOfWeek: null,
    startTime: null,
    endTime: null,
    isMandatory: false,
    requiresConfirmation: false,
    sortOrder: 30
  },
  {
    servingAreaSlug: "prayer-ministry-team",
    requirementType: "training",
    label: "Prayer/ministry team training",
    description:
      "This role may involve training or a conversation with church leadership.",
    dayOfWeek: null,
    startTime: null,
    endTime: null,
    isMandatory: false,
    requiresConfirmation: false,
    sortOrder: 10
  }
];

export type ProvisionedDefaultForm = {
  formId: number;
  formSlug: string;
};
