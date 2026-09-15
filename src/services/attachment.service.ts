import { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../config/database.js';
import { ApiError } from '../errors/api-error.js';
import env from '../config/env.js';

const attachmentSelect = {
  id: true,
  status: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  createdAt: true,
} satisfies Prisma.HealthEventAttachmentSelect;

type SelectedAttachment = Prisma.HealthEventAttachmentGetPayload<{ select: typeof attachmentSelect }>;

function serializeAttachment(attachment: SelectedAttachment & { storageKey?: string }) {
  return {
    id: attachment.id,
    status: attachment.status,
    originalName: attachment.originalName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    createdAt: attachment.createdAt.toISOString(),
    url: `${env.API_PUBLIC_URL}/uploads/${attachment.id}`,
  };
}

export async function createPendingAttachment(
  userId: string,
  file: { storageKey: string; originalName: string; mimeType: string; sizeBytes: number },
) {
  const attachment = await prisma.healthEventAttachment.create({
    data: {
      userId,
      storageKey: file.storageKey,
      originalName: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
    },
    select: { ...attachmentSelect, storageKey: true },
  });
  return serializeAttachment(attachment);
}

export async function attachToHealthEvent(userId: string, healthEventId: string, attachmentIds: string[]) {
  return prisma.$transaction(async (transaction) => {
    const event = await transaction.healthEvent.findFirst({
      where: { id: healthEventId, userId },
      select: { id: true },
    });
    if (!event) throw new ApiError(404, 'HEALTH_EVENT_NOT_FOUND', 'Health event not found.');

    const owned = await transaction.healthEventAttachment.findMany({
      where: { id: { in: attachmentIds }, userId, status: 'PENDING' },
      select: { id: true },
    });
    if (owned.length !== attachmentIds.length) {
      throw new ApiError(400, 'ATTACHMENT_NOT_FOUND', 'One or more attachments could not be found or are already attached.');
    }

    await transaction.healthEventAttachment.updateMany({
      where: { id: { in: attachmentIds }, userId, status: 'PENDING' },
      data: { healthEventId, status: 'ATTACHED' },
    });

    const attached = await transaction.healthEventAttachment.findMany({
      where: { healthEventId },
      select: attachmentSelect,
      orderBy: { createdAt: 'asc' },
    });
    return attached.map((attachment) => serializeAttachment(attachment));
  });
}

export async function getAttachmentFile(userId: string, attachmentId: string) {
  const attachment = await prisma.healthEventAttachment.findFirst({
    where: { id: attachmentId, userId },
    select: { storageKey: true, mimeType: true },
  });
  if (!attachment) throw new ApiError(404, 'ATTACHMENT_NOT_FOUND', 'Attachment not found.');
  return attachment;
}

export async function listAttachmentsForEvent(userId: string, healthEventId: string) {
  const attachments = await prisma.healthEventAttachment.findMany({
    where: { healthEventId, userId },
    select: attachmentSelect,
    orderBy: { createdAt: 'asc' },
  });
  return attachments.map((attachment) => serializeAttachment(attachment));
}
