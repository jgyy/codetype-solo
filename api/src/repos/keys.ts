// Single source of truth for DynamoDB key construction.
// Handlers must NEVER build PK/SK strings directly.

export const userPk = (sub: string) => `USER#${sub}`;
export const profileSk = () => "PROFILE";
export const attemptSk = (createdAt: string, clientAttemptId: string) =>
  `ATTEMPT#${createdAt}#${clientAttemptId.slice(0, 6)}`;
export const dateGsi1Sk = (createdAt: string) =>
  `DATE#${createdAt.slice(0, 10)}#${createdAt}`;

export const snippetPk = (lang: string) => `SNIPPET#${lang}`;
export const snippetSk = (id: string) => `SNIPPET#${id}`;

export const dailyPk = () => "DAILY";
export const dailySk = (date: string) => `DATE#${date}`;

export const submissionsPk = () => "SUBMISSIONS";
export const submissionStatusSk = (status: string, createdAt: string, id: string) =>
    `STATUS#${status}#${createdAt}#${id}`;
export const submissionUserGsi1Sk = (createdAt: string) => `SUBMISSION#${createdAt}`;
