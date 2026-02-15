import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import type { DeployTask } from '@/types'
import { deploy as deployApi } from '@/services/api'

interface DeployState {
  tasks: DeployTask[]
  currentTask: DeployTask | null
  loading: boolean
  error: string | null
}

const initialState: DeployState = {
  tasks: [],
  currentTask: null,
  loading: false,
  error: null,
}

export const fetchDeployTasks = createAsyncThunk(
  'deploy/fetchDeployTasks',
  async () => {
    return await deployApi.list()
  },
)

export const fetchDeployTask = createAsyncThunk(
  'deploy/fetchDeployTask',
  async (id: string) => {
    return await deployApi.get(id)
  },
)

export const createDeployTask = createAsyncThunk(
  'deploy/createDeployTask',
  async (data: Partial<DeployTask>) => {
    return await deployApi.create(data)
  },
)

const deploySlice = createSlice({
  name: 'deploy',
  initialState,
  reducers: {
    clearCurrentTask(state) {
      state.currentTask = null
    },
    clearError(state) {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    // Fetch all
    builder.addCase(fetchDeployTasks.pending, (state) => {
      state.loading = true
      state.error = null
    })
    builder.addCase(fetchDeployTasks.fulfilled, (state, action) => {
      state.loading = false
      state.tasks = action.payload
    })
    builder.addCase(fetchDeployTasks.rejected, (state, action) => {
      state.loading = false
      state.error = action.error.message || 'Failed to fetch deploy tasks'
    })

    // Fetch one
    builder.addCase(fetchDeployTask.pending, (state) => {
      state.error = null
    })
    builder.addCase(fetchDeployTask.fulfilled, (state, action) => {
      state.currentTask = action.payload
      // Also update in list
      const idx = state.tasks.findIndex((t) => t.id === action.payload.id)
      if (idx !== -1) {
        state.tasks[idx] = action.payload
      }
    })
    builder.addCase(fetchDeployTask.rejected, (state, action) => {
      state.error = action.error.message || 'Failed to fetch deploy task'
    })

    // Create
    builder.addCase(createDeployTask.pending, (state) => {
      state.loading = true
      state.error = null
    })
    builder.addCase(createDeployTask.fulfilled, (state, action) => {
      state.loading = false
      state.tasks.unshift(action.payload)
      state.currentTask = action.payload
    })
    builder.addCase(createDeployTask.rejected, (state, action) => {
      state.loading = false
      state.error = action.error.message || 'Failed to create deploy task'
    })
  },
})

export const { clearCurrentTask, clearError } = deploySlice.actions
export default deploySlice.reducer
