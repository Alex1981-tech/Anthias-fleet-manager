import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import type { Player } from '@/types'
import { players as playersApi } from '@/services/api'

interface PlayersState {
  players: Player[]
  loading: boolean
  error: string | null
}

const initialState: PlayersState = {
  players: [],
  loading: false,
  error: null,
}

export const fetchPlayers = createAsyncThunk(
  'players/fetchPlayers',
  async () => {
    return await playersApi.list()
  },
)

export const createPlayer = createAsyncThunk(
  'players/createPlayer',
  async (data: Partial<Player> & { password?: string }) => {
    return await playersApi.create(data)
  },
)

export const updatePlayer = createAsyncThunk(
  'players/updatePlayer',
  async ({ id, data }: { id: string; data: Partial<Player> & { password?: string } }) => {
    return await playersApi.update(id, data)
  },
)

export const deletePlayer = createAsyncThunk(
  'players/deletePlayer',
  async (id: string) => {
    await playersApi.delete(id)
    return id
  },
)

const playersSlice = createSlice({
  name: 'players',
  initialState,
  reducers: {
    clearError(state) {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    // Fetch players
    builder.addCase(fetchPlayers.pending, (state) => {
      state.loading = true
      state.error = null
    })
    builder.addCase(fetchPlayers.fulfilled, (state, action) => {
      state.loading = false
      state.players = action.payload
    })
    builder.addCase(fetchPlayers.rejected, (state, action) => {
      state.loading = false
      state.error = action.error.message || 'Failed to fetch players'
    })

    // Create player
    builder.addCase(createPlayer.pending, (state) => {
      state.loading = true
      state.error = null
    })
    builder.addCase(createPlayer.fulfilled, (state, action) => {
      state.loading = false
      state.players.push(action.payload)
    })
    builder.addCase(createPlayer.rejected, (state, action) => {
      state.loading = false
      state.error = action.error.message || 'Failed to create player'
    })

    // Update player
    builder.addCase(updatePlayer.pending, (state) => {
      state.loading = true
      state.error = null
    })
    builder.addCase(updatePlayer.fulfilled, (state, action) => {
      state.loading = false
      const index = state.players.findIndex((p) => p.id === action.payload.id)
      if (index !== -1) {
        state.players[index] = action.payload
      }
    })
    builder.addCase(updatePlayer.rejected, (state, action) => {
      state.loading = false
      state.error = action.error.message || 'Failed to update player'
    })

    // Delete player
    builder.addCase(deletePlayer.pending, (state) => {
      state.loading = true
      state.error = null
    })
    builder.addCase(deletePlayer.fulfilled, (state, action) => {
      state.loading = false
      state.players = state.players.filter((p) => p.id !== action.payload)
    })
    builder.addCase(deletePlayer.rejected, (state, action) => {
      state.loading = false
      state.error = action.error.message || 'Failed to delete player'
    })
  },
})

export const { clearError } = playersSlice.actions
export default playersSlice.reducer
