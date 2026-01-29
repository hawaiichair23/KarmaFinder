
<img width="1900" height="823" alt="pic2" src="https://github.com/user-attachments/assets/b2a64bf4-2732-4495-97e7-6678a8b25f36" />
<h1>
  <img width="34" height="35" alt="KarmaFinder logo" src="https://github.com/user-attachments/assets/2650bd36-1834-4b96-96bb-851e9536a6e2" />
  KarmaFinder 
</h1>

**A fast & responsive browser-based Reddit client** with semantic search, bookmark features, advanced filters, themes and more.

**Live Site:** https://karmafinder.site/


**Demo Video:** https://karmafinder.site/html/features.html

### **Features**
- Batch rendering for performance, caching for quick responses, minimal API load
- Passwordless magic link login (login optional)
- NSFW blur filter with pattern detection

<img width="1921" height="877" alt="pic1" src="https://github.com/user-attachments/assets/ce3fb592-ef48-4221-9407-c72db4f96f16" />

### **Section analytics and metadata** 
- Track creation date, bookmark count, top subreddit, last modified, with custom descriptions for organizing collections
- Share info via copy link or over social media

<img width="1911" height="872" alt="pic3" src="https://github.com/user-attachments/assets/2aaba838-7609-4a0f-9fe0-65fcce11a891" />

### **Imports**

- Import Reddit saves instantly using OAuth single click login
- See number of unique posts
- Saves populate in order to any section

<img width="1919" height="828" alt="pic3" src="https://github.com/user-attachments/assets/eb81edd1-35b7-4fd1-93e8-af0fbfe3a20f" />

### **Bookmarks**

- Move any post with dropdown menu
- Organize posts inside custom sections with drag-and-drop
- Choose emoji, rename, and delete sections
- Generate public links to share curated bookmark collections with anyone, no login required

<img width="1918" height="849" alt="pic8" src="https://github.com/user-attachments/assets/b27b2f3f-8ad5-4ef1-8fd6-a554df0a2479" />

### **Search**

- Enhanced Search: semantic search with vector embeddings using Pinecone, query matching and algorithmic ranking
- Smart filtering with progressive fetch - batch filter by content type (video/image/text, time period) keeps fetching from Reddit until it collects 10 posts matching filters 
- Combine filters Reddit doesn't allow (hot + past week, etc.)
- Dynamic search suggestions with spell check from dictionary, word completion API, and user input

    
<img width="1916" height="873" alt="pic7" src="https://github.com/user-attachments/assets/48c1b936-957f-466a-8748-dfcb8fc0f1e8" />

### **Media**

- Plyr.io player for smooth playback on Reddit video: ffmpeg merges audio/video streams and caches on local CDN
- YouTube and Streamable embeds 
- Modal viewer with zoom and smooth gallery navigation with preloading & decoding for seamless transitions
- Markdown and image support in comments
  
<img width="1712" height="853" alt="pic9" src="https://github.com/user-attachments/assets/413c7ae7-d2ed-4566-8940-7254898e2472" />

### **UI**

- Multiple themes (Forest, Bluebird, dark, light)
- Configurable layouts: Comfy and Compact modes for different card sizes
- Top 8 comments on every post without clicking through
- Hermes - animated kitty mascot with 100+ unique contextual responses <img width="24" height="25" alt="KarmaFinder logo" src="https://github.com/user-attachments/assets/2650bd36-1834-4b96-96bb-851e9536a6e2" />

### **Misc Features**
- Batch rendering for performance, caching for quick responses, minimal API load
- Passwordless magic link login (login optional)
- NSFW blur filter with pattern detection

# **Install**
## Local Installation
```bash
git clone https://github.com/hawaiichair23/karmafinder.git
cd karmafinder
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)
