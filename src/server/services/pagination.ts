export type PaginationInput = { page: number; pageSize: number };

export function paginate<T>(items: T[], total: number, { page, pageSize }: PaginationInput) {
  return {
    items,
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export function skipTake({ page, pageSize }: PaginationInput) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}
