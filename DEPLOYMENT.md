# 🚀 Deployment Guide - Europe Simulator P2P

This guide explains how to deploy your Europe Simulator with full P2P functionality to various cloud platforms.

## 📋 Pre-deployment Checklist

- [ ] Game works locally with `npm start`
- [ ] All files are committed to Git
- [ ] Repository is pushed to GitHub
- [ ] WebRTC configuration is correct

## 🌐 Cloud Deployment Options

### Option 1: Heroku (Recommended)

1. **Create a Heroku app:**
   ```bash
   heroku create your-europe-simulator
   ```

2. **Deploy:**
   ```bash
   git push heroku main
   ```

3. **Set environment variables:**
   ```bash
   heroku config:set NODE_ENV=production
   ```

4. **Open your app:**
   ```bash
   heroku open
   ```

**Live URL:** `https://your-europe-simulator.herokuapp.com`

### Option 2: Vercel

1. **Install Vercel CLI:**
   ```bash
   npm install -g vercel
   ```

2. **Deploy:**
   ```bash
   vercel
   ```

3. **Follow the prompts to link your GitHub repo**

**Live URL:** `https://your-project.vercel.app`

### Option 3: Railway

1. **Connect your GitHub repo at [railway.app](https://railway.app)**
2. **Select your europe-simulator repository**
3. **Railway auto-deploys from main branch**

### Option 4: Render

1. **Create new Web Service at [render.com](https://render.com)**
2. **Connect your GitHub repository**
3. **Use these settings:**
   - Build Command: `npm install`
   - Start Command: `npm start`

## 🔧 Post-Deployment Configuration

### Update Signaling Server URL

After deployment, update `script.js`:

```javascript
// Replace this line:
const SIGNALING_SERVER = window.location.origin.replace(/^http/, 'ws');

// With your deployed URL:
const SIGNALING_SERVER = 'wss://your-app.herokuapp.com';
```

### Test P2P Connectivity

1. Open your deployed game in multiple browser tabs
2. Create a room and join from another tab
3. Test country selection and game start
4. Verify attacks and fort upgrades work

## 🌍 Custom Domain Setup

### Heroku Custom Domain
```bash
heroku domains:add www.youreuropegame.com
heroku certs:auto:enable
```

### Vercel Custom Domain
1. Go to Project Settings → Domains
2. Add your custom domain
3. Update DNS records as instructed

## 🔒 Security Considerations

### Environment Variables
```bash
# Production settings
NODE_ENV=production
MAX_ROOMS=100
RATE_LIMIT_ENABLED=true
```

### CORS Configuration
Update `server.js` for production:
```javascript
// Add allowed origins
const allowedOrigins = [
    'https://yourdomain.com',
    'https://www.yourdomain.com'
];
```

## 📊 Monitoring & Analytics

### Add Health Check Endpoint
```javascript
// In server.js
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        rooms: rooms.size,
        connections: playerConnections.size,
        uptime: process.uptime()
    });
});
```

### Log Management
```bash
# Heroku logs
heroku logs --tail

# View specific logs
heroku logs --source app --tail
```

## 🐛 Troubleshooting Deployment

### Common Issues

**WebSocket Connection Fails:**
- Check if platform supports WebSockets
- Verify wss:// protocol is used
- Test with curl: `curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" wss://yourapp.com`

**Game State Not Syncing:**
- Check browser console for errors
- Verify all players are on same deployed version
- Test with fallback mode

**High Memory Usage:**
- Implement room cleanup in production
- Add connection limits
- Monitor with platform tools

### Platform-Specific Notes

**Heroku:**
- Free tier sleeps after 30 minutes
- Upgrade to Hobby tier for 24/7 uptime
- Enable session affinity for WebSockets

**Vercel:**
- Serverless functions have 10-second timeout
- Consider using Vercel Edge Runtime
- WebSocket support may be limited

**Railway:**
- Provides persistent storage
- Good for WebSocket applications
- Automatic HTTPS certificates

## 📈 Scaling Considerations

### Load Balancing
For high traffic, consider:
- Multiple server instances
- Redis for shared state
- Geographic distribution

### Performance Optimization
```javascript
// Add compression
app.use(compression());

// Set cache headers
app.use(express.static('public', {
    maxAge: '1d'
}));
```

## 🔄 CI/CD Pipeline

### GitHub Actions Example
```yaml
name: Deploy to Heroku
on:
  push:
    branches: [ main ]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v2
    - uses: akhileshns/heroku-deploy@v3.12.12
      with:
        heroku_api_key: ${{secrets.HEROKU_API_KEY}}
        heroku_app_name: "your-europe-simulator"
        heroku_email: "your-email@example.com"
```

## 📱 Mobile Optimization

### PWA Configuration
Add to your HTML:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="manifest" href="/manifest.json">
```

### Touch Controls
```css
/* Touch-friendly buttons */
.attack-btn {
    min-height: 44px;
    min-width: 44px;
}
```

## 🎯 Go Live Checklist

- [ ] Game deployed and accessible
- [ ] WebSocket connections working
- [ ] P2P connectivity tested
- [ ] Multiple players can join
- [ ] Combat system functional
- [ ] Economy growth working
- [ ] Mobile responsive
- [ ] Custom domain configured (optional)
- [ ] Monitoring setup
- [ ] Backup strategy planned

**Congratulations! Your Europe Simulator is now live! 🎉**

Share your game URL with friends and start conquering Europe together!
