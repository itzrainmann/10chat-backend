const express = require('express')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')
const app = express()
app.use(express.json())

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
)

const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
)

app.get('/profile/:username', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'profile.html'))
})

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

app.use(express.static(path.join(__dirname, 'public')))

// GET all posts
app.get('/api/posts', async (req, res) => {
    const { data, error } = await supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false })
    if (error) return res.status(500).json({ error })
    res.json(data)
})

// POST new post
app.post('/api/posts', async (req, res) => {
    const { title, body } = req.body
    const { data, error } = await supabase
        .from('posts')
        .insert([{ title, body, likes: 0 }])
    if (error) return res.status(500).json({ error })
    res.json({ success: true, data })
})

// LIKE a post
app.post('/api/posts/:id/like', async (req, res) => {
    const { id } = req.params
    const { data: post } = await supabase
        .from('posts').select('likes').eq('id', id).single()
    const { error } = await supabase.from('posts')
        .update({ likes: post.likes + 1 }).eq('id', id)
    if (error) return res.status(500).json({ error })
    res.json({ success: true })
})

// UNLIKE a post
app.post('/api/posts/:id/unlike', async (req, res) => {
    const { id } = req.params
    const { data: post } = await supabase
        .from('posts').select('likes').eq('id', id).single()
    const { error } = await supabase.from('posts')
        .update({ likes: Math.max(0, post.likes - 1) }).eq('id', id)
    if (error) return res.status(500).json({ error })
    res.json({ success: true })
})

// DELETE a post
app.delete('/api/posts/:id', async (req, res) => {
    const { id } = req.params
    const { error } = await supabase.from('posts').delete().eq('id', id)
    if (error) return res.status(500).json({ error })
    res.json({ success: true })
})

app.post('/api/visit', async (req, res) => {
    const { data } = await supabase.from('visits').select('count').eq('id', 1).single()
    const { error } = await supabase.from('visits').update({ count: data.count + 1 }).eq('id', 1)
    if (error) return res.status(500).json({ error })
    res.json({ count: data.count + 1 })
})

app.get('/api/visits', async (req, res) => {
    const { data } = await supabase.from('visits').select('count').eq('id', 1).single()
    res.json({ count: data.count })
})

// SIGN UP
app.post('/api/signup', async (req, res) => {
    const { username, email, password } = req.body

    if (!username || username.length < 2 || username.length > 15) {
        return res.json({ error: 'Username must be between 2 and 15 characters.' })
    }

    const { data: existing } = await supabase
        .from('profiles')
        .select('username')
        .eq('username', username)
        .single()

    if (existing) {
        return res.json({ error: 'That username is already taken.' })
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true
    })

    if (authError) {
        return res.json({ error: authError.message })
    }

    const { error: profileError } = await supabase
        .from('profiles')
        .insert([{ id: authData.user.id, username }])

    if (profileError) {
        return res.json({ error: profileError.message })
    }

    res.json({ success: true })
})

// LOG IN
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body

    const { data: profile } = await supabase
        .from('profiles')
        .select('id, username')
        .eq('username', username)
        .single()

    if (!profile) {
        return res.json({ error: 'Username not found.' })
    }

    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(profile.id)

    if (!userData) {
        return res.json({ error: 'Account not found.' })
    }

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: userData.user.email,
        password
    })

    if (signInError) {
        return res.json({ error: 'Incorrect password.' })
    }

    res.json({
        success: true,
        token: signInData.session.access_token,
        username: profile.username,
        userId: profile.id
    })
})

// LOG OUT
app.post('/api/logout', async (req, res) => {
    await supabase.auth.signOut()
    res.json({ success: true })
})

// GET a user's profile
app.get('/api/profile/:username', async (req, res) => {
    const { username } = req.params

    const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', username)
        .single()

    if (error || !profile) {
        return res.status(404).json({ error: 'User not found' })
    }

    const { data: posts } = await supabase
        .from('posts')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })

    // Get friend count (accepted friendships involving this user)
    const { count: friendCount } = await supabase
        .from('friend_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'accepted')
        .or(`sender_id.eq.${profile.id},receiver_id.eq.${profile.id}`)

    res.json({ profile, posts: posts || [], friendCount: friendCount || 0 })
})

// UPDATE a user's profile
app.post('/api/profile/update', async (req, res) => {
    const { userId, bio, status } = req.body

    const { error } = await supabase
        .from('profiles')
        .update({ bio, status })
        .eq('id', userId)

    if (error) return res.status(500).json({ error: error.message })
    res.json({ success: true })
})

// ─────────────────────────────────────────────
//  PHASE 3 — FRIEND SYSTEM
// ─────────────────────────────────────────────

// GET friendship status between two users
// Returns: 'none' | 'pending_sent' | 'pending_received' | 'accepted'
app.get('/api/friends/status', async (req, res) => {
    const { userId, targetId } = req.query

    if (!userId || !targetId || userId === targetId) {
        return res.json({ status: 'none' })
    }

    const { data } = await supabase
        .from('friend_requests')
        .select('*')
        .or(
            `and(sender_id.eq.${userId},receiver_id.eq.${targetId}),and(sender_id.eq.${targetId},receiver_id.eq.${userId})`
        )
        .single()

    if (!data) return res.json({ status: 'none' })

    if (data.status === 'accepted') return res.json({ status: 'accepted', requestId: data.id })

    if (data.sender_id === userId) {
        return res.json({ status: 'pending_sent', requestId: data.id })
    } else {
        return res.json({ status: 'pending_received', requestId: data.id })
    }
})

// SEND a friend request
app.post('/api/friends/request', async (req, res) => {
    const { senderId, receiverId } = req.body

    if (!senderId || !receiverId || senderId === receiverId) {
        return res.status(400).json({ error: 'Invalid request.' })
    }

    // Check no existing request/friendship
    const { data: existing } = await supabase
        .from('friend_requests')
        .select('id')
        .or(
            `and(sender_id.eq.${senderId},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${senderId})`
        )
        .single()

    if (existing) {
        return res.json({ error: 'A friend request already exists between these users.' })
    }

    const { error } = await supabase
        .from('friend_requests')
        .insert([{ sender_id: senderId, receiver_id: receiverId, status: 'pending' }])

    if (error) return res.status(500).json({ error: error.message })
    res.json({ success: true })
})

// ACCEPT a friend request
app.post('/api/friends/accept', async (req, res) => {
    const { requestId, userId } = req.body

    // Make sure this user is the receiver
    const { data: request } = await supabase
        .from('friend_requests')
        .select('*')
        .eq('id', requestId)
        .single()

    if (!request) return res.status(404).json({ error: 'Request not found.' })
    if (request.receiver_id !== userId) return res.status(403).json({ error: 'Not authorised.' })

    const { error } = await supabase
        .from('friend_requests')
        .update({ status: 'accepted' })
        .eq('id', requestId)

    if (error) return res.status(500).json({ error: error.message })
    res.json({ success: true })
})

// DECLINE or CANCEL a friend request (also used to unfriend)
app.post('/api/friends/remove', async (req, res) => {
    const { requestId, userId } = req.body

    // Make sure this user is sender or receiver
    const { data: request } = await supabase
        .from('friend_requests')
        .select('*')
        .eq('id', requestId)
        .single()

    if (!request) return res.status(404).json({ error: 'Request not found.' })

    if (request.sender_id !== userId && request.receiver_id !== userId) {
        return res.status(403).json({ error: 'Not authorised.' })
    }

    const { error } = await supabase
        .from('friend_requests')
        .delete()
        .eq('id', requestId)

    if (error) return res.status(500).json({ error: error.message })
    res.json({ success: true })
})

// GET a user's friends list (accepted)
app.get('/api/friends/:userId', async (req, res) => {
    const { userId } = req.params

    const { data: requests, error } = await supabase
        .from('friend_requests')
        .select('*')
        .eq('status', 'accepted')
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)

    if (error) return res.status(500).json({ error: error.message })

    // Get the friend's profile for each accepted request
    const friendIds = requests.map(r =>
        r.sender_id === userId ? r.receiver_id : r.sender_id
    )

    if (friendIds.length === 0) return res.json({ friends: [] })

    const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, status')
        .in('id', friendIds)

    res.json({ friends: profiles || [] })
})

// GET pending friend requests received by a user
app.get('/api/friends/pending/:userId', async (req, res) => {
    const { userId } = req.params

    const { data: requests, error } = await supabase
        .from('friend_requests')
        .select('*')
        .eq('receiver_id', userId)
        .eq('status', 'pending')

    if (error) return res.status(500).json({ error: error.message })

    if (!requests || requests.length === 0) return res.json({ pending: [] })

    const senderIds = requests.map(r => r.sender_id)

    const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', senderIds)

    // Merge request ID into profile objects
    const pending = profiles.map(profile => {
        const req = requests.find(r => r.sender_id === profile.id)
        return { ...profile, requestId: req.id }
    })

    res.json({ pending })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log('Running on port ' + PORT))