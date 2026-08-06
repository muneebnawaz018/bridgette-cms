import type { Model, PipelineStage } from 'mongoose';
import { DEFAULT_LIMIT, MAX_LIMIT } from '@/lib/query/limits';

export interface PageParams {
  page?: number;
  limit?: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function clampPage(params: PageParams): { page: number; limit: number; skip: number } {
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(params.limit ?? DEFAULT_LIMIT)));
  return { page, limit, skip: (page - 1) * limit };
}

/**
 * Paginate via an aggregation pipeline. Items + total are computed in a single round-trip
 * using `$facet`. Use for longer/complex queries (joins, computed fields, search). Pass the
 * already role-scoped `$match`/lookup stages; sorting + skip/limit are applied to the page.
 */
export async function aggregatePaginate<T>(
  model: Model<T>,
  stages: PipelineStage[],
  params: PageParams = {},
  sort: Record<string, 1 | -1> = { createdAt: -1 },
): Promise<Paginated<T>> {
  const { page, limit, skip } = clampPage(params);

  const [facet] = await model.aggregate([
    ...stages,
    {
      $facet: {
        items: [{ $sort: sort }, { $skip: skip }, { $limit: limit }],
        meta: [{ $count: 'total' }],
      },
    },
  ]);

  const items = (facet?.items ?? []) as T[];
  const total = (facet?.meta?.[0]?.total ?? 0) as number;
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
}
