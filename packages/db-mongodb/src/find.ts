import type { PipelineStage } from 'mongoose'
import type { Find } from 'payload'

import type { MongooseAdapter } from './index.js'

import { buildSortParam } from './queries/buildSortParam.js'
import { buildJoinAggregation } from './utilities/buildJoinAggregation.js'
import { buildProjectionFromSelect } from './utilities/buildProjectionFromSelect.js'
import { findMany } from './utilities/findMany.js'
import { getCollation } from './utilities/getCollation.js'
import { getHasNearConstraint } from './utilities/getHasNearConstraint.js'
import { getSession } from './utilities/getSession.js'
import { mergeProjections } from './utilities/mergeProjections.js'
import { transform } from './utilities/transform.js'

export const find: Find = async function find(
  this: MongooseAdapter,
  {
    collection,
    joins = {},
    limit = 0,
    locale,
    page,
    pagination,
    req,
    select,
    sort: sortArg,
    where,
  },
) {
  const Model = this.collections[collection]
  const collectionConfig = this.payload.collections[collection].config
  const session = await getSession(this, req)

  const hasNearConstraint = getHasNearConstraint(where)

  const fields = collectionConfig.flattenedFields

  let sort
  if (!hasNearConstraint) {
    sort = buildSortParam({
      config: this.payload.config,
      fields,
      locale,
      sort: sortArg || collectionConfig.defaultSort,
      timestamps: true,
    })
  }

  const queryAggregation: PipelineStage[] = []

  const queryProjection = {}
  const query = await Model.buildQuery({
    aggregation: queryAggregation,
    locale,
    payload: this.payload,
    projection: queryProjection,
    session,
    where,
  })

  const projection = mergeProjections({
    queryProjection,
    selectProjection: buildProjectionFromSelect({
      adapter: this,
      fields: collectionConfig.flattenedFields,
      select,
    }),
  })

  // useEstimatedCount is faster, but not accurate, as it ignores any filters. It is thus set to true if there are no filters.
  const useEstimatedCount = hasNearConstraint || !query || Object.keys(query).length === 0

  const joinAggregation = await buildJoinAggregation({
    adapter: this,
    collection,
    collectionConfig,
    joins,
    locale,
    session,
  })

  const result = await findMany({
    adapter: this,
    collation: getCollation({ adapter: this, locale }),
    collection: Model.collection,
    joinAggregation,
    limit,
    page,
    pagination,
    projection,
    query,
    queryAggregation,
    session,
    sort,
    useEstimatedCount,
  })

  transform({ adapter: this, data: result.docs, fields, operation: 'read' })

  return result
}
