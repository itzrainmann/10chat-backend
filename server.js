const express = require('express')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')
const app = express()
app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

// Regular client for normal queries
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
)

// Admin client for auth operations
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

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

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

    // Check username is valid
    if (!username || username.length < 2 || username.length > 15) {
        return res.json({ error: 'Username must be between 2 and 15 characters.' })
    }

    // Check username isn't already taken
    const { data: existing } = await supabase
        .from('profiles')
        .select('username')
        .eq('username', username)
        .single()

    if (existing) {
        return res.json({ error: 'That username is already taken.' })
    }

    // Create the auth account in Supabase
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true
    })

    if (authError) {
        return res.json({ error: authError.message })
    }

    // Create their profile row
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

    // Find their email from username
    const { data: profile } = await supabase
        .from('profiles')
        .select('id, username')
        .eq('username', username)
        .single()

    if (!profile) {
        return res.json({ error: 'Username not found.' })
    }

    // Get their email from auth
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(profile.id)

    if (!userData) {
        return res.json({ error: 'Account not found.' })
    }

    // Sign in with email and password
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

    // Get their posts too
    const { data: posts } = await supabase
        .from('posts')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })

    res.json({ profile, posts: posts || [] })
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

// Serve profile pages
app.get('/profile/:username', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'profile.html'))
})
const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log('Running on port ' + PORT))