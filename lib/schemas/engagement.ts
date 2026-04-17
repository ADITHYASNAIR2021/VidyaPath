import { z } from 'zod';

export const pushSubscribeSchema = z
  .object({
    endpoint: z.string().trim().url().max(2048),
    keys: z.object({
      p256dh: z.string().trim().min(8).max(512),
      auth: z.string().trim().min(8).max(512),
    }),
  })
  .passthrough();

export const pushSendSchema = z
  .object({
    title: z.string().trim().max(140).optional(),
    message: z.string().trim().min(1).max(500),
    url: z.string().trim().max(512).optional(),
    schoolId: z.string().trim().max(80).optional(),
  })
  .passthrough();

export const announcementReadSchema = z
  .object({
    announcementId: z.string().trim().min(1).max(128),
  })
  .passthrough();
