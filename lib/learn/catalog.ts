/**
 * What is left of the first catalog module.
 *
 * Its course readers were replaced by `lib/learn/library.ts` (the class
 * library, its shelves and one class's page) and nothing called them any more;
 * one of them listed progress on unpublished classes, so they went rather than
 * waiting to be picked up again. The discussion key stays because the learn
 * seed still writes it.
 */
export function lessonDiscussionKey(lessonId: string) {
  return `vu:lesson:${lessonId}`;
}
