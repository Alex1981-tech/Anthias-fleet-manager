import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import type { Group } from '@/types'
import { groups as groupsApi } from '@/services/api'

interface GroupsState {
  groups: Group[]
  loading: boolean
  error: string | null
}

const initialState: GroupsState = {
  groups: [],
  loading: false,
  error: null,
}

export const fetchGroups = createAsyncThunk(
  'groups/fetchGroups',
  async () => {
    return await groupsApi.list()
  },
)

export const createGroup = createAsyncThunk(
  'groups/createGroup',
  async (data: Partial<Group>) => {
    return await groupsApi.create(data)
  },
)

export const updateGroup = createAsyncThunk(
  'groups/updateGroup',
  async ({ id, data }: { id: string; data: Partial<Group> }) => {
    return await groupsApi.update(id, data)
  },
)

export const deleteGroup = createAsyncThunk(
  'groups/deleteGroup',
  async (id: string) => {
    await groupsApi.delete(id)
    return id
  },
)

const groupsSlice = createSlice({
  name: 'groups',
  initialState,
  reducers: {
    clearError(state) {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    // Fetch groups
    builder.addCase(fetchGroups.pending, (state) => {
      state.loading = true
      state.error = null
    })
    builder.addCase(fetchGroups.fulfilled, (state, action) => {
      state.loading = false
      state.groups = action.payload
    })
    builder.addCase(fetchGroups.rejected, (state, action) => {
      state.loading = false
      state.error = action.error.message || 'Failed to fetch groups'
    })

    // Create group
    builder.addCase(createGroup.pending, (state) => {
      state.loading = true
      state.error = null
    })
    builder.addCase(createGroup.fulfilled, (state, action) => {
      state.loading = false
      state.groups.push(action.payload)
    })
    builder.addCase(createGroup.rejected, (state, action) => {
      state.loading = false
      state.error = action.error.message || 'Failed to create group'
    })

    // Update group
    builder.addCase(updateGroup.pending, (state) => {
      state.loading = true
      state.error = null
    })
    builder.addCase(updateGroup.fulfilled, (state, action) => {
      state.loading = false
      const index = state.groups.findIndex((g) => g.id === action.payload.id)
      if (index !== -1) {
        state.groups[index] = action.payload
      }
    })
    builder.addCase(updateGroup.rejected, (state, action) => {
      state.loading = false
      state.error = action.error.message || 'Failed to update group'
    })

    // Delete group
    builder.addCase(deleteGroup.pending, (state) => {
      state.loading = true
      state.error = null
    })
    builder.addCase(deleteGroup.fulfilled, (state, action) => {
      state.loading = false
      state.groups = state.groups.filter((g) => g.id !== action.payload)
    })
    builder.addCase(deleteGroup.rejected, (state, action) => {
      state.loading = false
      state.error = action.error.message || 'Failed to delete group'
    })
  },
})

export const { clearError } = groupsSlice.actions
export default groupsSlice.reducer
