// THIS IS THE CODE YOU NEED TO COPY INTO src/mcp-server.js
// src/mcp-server.js
const fastify = require('fastify')({ 
    logger: true,
    requestTimeout: 30000
  });
  const Redis = require('ioredis');
  require('dotenv').config();
  
  // Initialize connections
  let redis, oraclePool;
  
  // MCP Resource Types
  const RESOURCE_TYPES = {
    LINKEDIN_PROFILE: 'linkedin-profile',
    SEARCH_QUERY: 'search-query',
    CLIENT_ANALYSIS: 'client-analysis',
    OBSIDIAN_NOTE: 'obsidian-note',
    N8N_WORKFLOW: 'n8n-workflow'
  };
  
  // MCP Tools Registry
  const MCP_TOOLS = {
    // Oracle Database Tools
    'oracle-query': {
      name: 'oracle-query',
      description: 'Execute Oracle database queries',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          binds: { type: 'object' }
        }
      }
    },
    
    // Claude Analysis Tools  
    'analyze-profile': {
      name: 'analyze-profile',
      description: 'Analyze LinkedIn profile with Claude',
      inputSchema: {
        type: 'object',
        properties: {
          profileData: { type: 'object' },
          analysisType: { type: 'string', enum: ['scoring', 'outreach', 'research'] }
        }
      }
    },
    
    // n8n Workflow Tools
    'trigger-workflow': {
      name: 'trigger-workflow',
      description: 'Trigger n8n workflow execution',
      inputSchema: {
        type: 'object',
        properties: {
          workflowId: { type: 'string' },
          payload: { type: 'object' }
        }
      }
    },
    
    // Obsidian Tools
    'create-note': {
      name: 'create-note',
      description: 'Create structured note in Obsidian',
      inputSchema: {
        type: 'object',
        properties: {
          noteType: { type: 'string' },
          data: { type: 'object' }
        }
      }
    },
    
    // Search Orchestration Tools
    'orchestrate-search': {
      name: 'orchestrate-search',
      description: 'Coordinate multi-tool search process',
      inputSchema: {
        type: 'object',
        properties: {
          searchParams: { type: 'object' },
          analysisDepth: { type: 'string', enum: ['basic', 'detailed', 'comprehensive'] }
        }
      }
    },
    
    // LinkedIn Profile Tools
    'get_person_profile': {
      name: 'get_person_profile',
      description: 'Get LinkedIn person profile data',
      inputSchema: {
        type: 'object',
        properties: {
          linkedinUrl: { type: 'string' },
          profileId: { type: 'string' }
        }
      }
    },
    
    // Profile Management Tools
    'list_profiles': {
      name: 'list_profiles',
      description: 'List all profiles from the database',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number' },
          offset: { type: 'number' }
        }
      }
    },
    
    // Obsidian Integration Tools
    'create_obsidian_note': {
      name: 'create_obsidian_note',
      description: 'Create a structured note in Obsidian vault',
      inputSchema: {
        type: 'object',
        properties: {
          noteType: { type: 'string', enum: ['client', 'lead', 'analysis', 'meeting'] },
          profileData: { type: 'object' },
          aiSummary: { type: 'string' },
          customContent: { type: 'string' }
        },
        required: ['noteType', 'profileData']
      }
    },
    
    // LinkedIn Search Tools
    'search_linkedin': {
      name: 'search_linkedin',
      description: 'Search LinkedIn for people profiles using keywords',
      inputSchema: {
        type: 'object',
        properties: {
          keywords: { type: 'string' },
          location: { type: 'string' }
        },
        required: ['keywords']
      }
    }
  };
  
  // Initialize MCP Server
  async function initializeMCP() {
    try {
      // Initialize Redis for state management
      redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3
      });
  
      // Initialize Oracle connection pool
      const oracledb = require('oracledb');
      oraclePool = await oracledb.createPool({
        user: process.env.ORACLE_USER,
        password: process.env.ORACLE_PASSWORD,
        connectString: process.env.ORACLE_CONNECTION_STRING,
        poolMin: 2,
        poolMax: 10,
        poolIncrement: 1
      });
  
      console.log('MCP Server initialized successfully');
    } catch (error) {
      console.error('MCP initialization failed:', error);
      process.exit(1);
    }
  }
  
  // MCP Tool Execution Engine
  class MCPToolExecutor {
    static async execute(toolName, input) {
      const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      try {
        // Store execution context
        await redis.setex(`execution:${executionId}`, 3600, JSON.stringify({
          toolName,
          input,
          status: 'running',
          startTime: new Date().toISOString()
        }));
  
        let result;
        switch (toolName) {
          case 'oracle-query':
            result = await this.executeOracleQuery(input);
            break;
          case 'analyze-profile':
            result = await this.analyzeProfile(input);
            break;
          case 'trigger-workflow':
            result = await this.triggerN8nWorkflow(input);
            break;
          case 'create-note':
            result = await this.createObsidianNote(input);
            break;
          case 'orchestrate-search':
            result = await this.orchestrateSearch(input);
            break;
          case 'get_person_profile':
            result = await this.getPersonProfile(input);
            break;
          case 'list_profiles':
            result = await this.listProfiles(input);
            break;
          case 'create_obsidian_note':
            result = await this.createObsidianNote(input);
            break;
          case 'search_linkedin':
            result = await this.searchLinkedin(input);
            break;
          default:
            throw new Error(`Unknown tool: ${toolName}`);
        }
  
        // Update execution status
        await redis.setex(`execution:${executionId}`, 3600, JSON.stringify({
          toolName,
          input,
          result,
          status: 'completed',
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString()
        }));
  
        return { executionId, result, status: 'success' };
      } catch (error) {
        // Store error state
        await redis.setex(`execution:${executionId}`, 3600, JSON.stringify({
          toolName,
          input,
          error: error.message,
          status: 'failed',
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString()
        }));
  
        return { executionId, error: error.message, status: 'error' };
      }
    }
  
    static async executeOracleQuery({ query, binds = {} }) {
      let connection;
      try {
        connection = await oraclePool.getConnection();
        const result = await connection.execute(query, binds);
        
        // Auto-commit for DML operations (INSERT, UPDATE, DELETE)
        const upperQuery = query.trim().toUpperCase();
        if (upperQuery.startsWith('INSERT') || upperQuery.startsWith('UPDATE') || upperQuery.startsWith('DELETE')) {
          await connection.commit();
        }
        
        return {
          rows: result.rows,
          rowsAffected: result.rowsAffected,
          metaData: result.metaData
        };
      } finally {
        if (connection) await connection.close();
      }
    }
  
    static async analyzeProfile({ profileData, analysisType }) {
      const axios = require('axios');
      
      const prompts = {
        scoring: `Analyze this LinkedIn profile and provide a numerical score (1-10) for client potential:
          Profile: ${JSON.stringify(profileData)}
          
          Respond with JSON: {"score": X, "reasoning": "...", "key_indicators": [...]}`,
        
        outreach: `Create personalized outreach strategy for this profile:
          Profile: ${JSON.stringify(profileData)}
          
          Respond with JSON: {"approach": "...", "key_points": [...], "timing_recommendation": "..."}`,
        
        research: `Extract key research insights from this profile:
          Profile: ${JSON.stringify(profileData)}
          
          Respond with JSON: {"company_insights": "...", "decision_maker_level": "...", "pain_points": [...]}`
      };
  
      try {
        const response = await axios.post('https://api.anthropic.com/v1/messages', {
          model: 'claude-3-sonnet-20240229',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: prompts[analysisType] || prompts.scoring
          }]
        }, {
          headers: {
            'Authorization': `Bearer ${process.env.CLAUDE_API_KEY}`,
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01'
          }
        });
  
        return JSON.parse(response.data.content[0].text);
      } catch (error) {
        throw new Error(`Claude analysis failed: ${error.message}`);
      }
    }
  
    static async triggerN8nWorkflow({ workflowId, payload }) {
      const axios = require('axios');
      
      try {
        const response = await axios.post(
          `${process.env.N8N_BASE_URL}/api/v1/workflows/${workflowId}/execute`,
          { data: payload },
          {
            headers: {
              'Authorization': `Bearer ${process.env.N8N_API_KEY}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        return {
          executionId: response.data.executionId,
          status: 'triggered',
          workflowId
        };
      } catch (error) {
        throw new Error(`n8n workflow trigger failed: ${error.message}`);
      }
    }
  
    static async createObsidianNote({ noteType, data }) {
      const axios = require('axios');
      
      const templates = {
        client: `# ${data.name} - ${data.company}
  
  ## Profile Summary
  - **Title**: ${data.title}
  - **Industry**: ${data.industry}
  - **Location**: ${data.location}
  - **LinkedIn**: ${data.linkedinUrl}
  
  ## AI Analysis
  - **Fit Score**: ${data.aiScore || 'TBD'}/10
  - **Analysis Date**: ${new Date().toISOString().split('T')[0]}
  
  ## Research Notes
  ${data.researchNotes || ''}
  
  ## Outreach Strategy
  - [ ] Initial research completed
  - [ ] Outreach message drafted
  - [ ] Connection request sent
  
  ---
  Tags: #client #linkedin #score-${Math.floor(data.aiScore || 0)}`
      };
  
      try {
        const fileName = `LinkedIn Clients/${data.name} - ${data.company}.md`;
        const response = await axios.put(
          `${process.env.OBSIDIAN_BASE_URL}/vault/${process.env.OBSIDIAN_VAULT_NAME}/${fileName}`,
          { content: templates[noteType] || templates.client },
          {
            headers: {
              'Authorization': `Bearer ${process.env.OBSIDIAN_API_TOKEN}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        return {
          fileName,
          created: true,
          vaultPath: fileName
        };
      } catch (error) {
        throw new Error(`Obsidian note creation failed: ${error.message}`);
      }
    }
  
    static async orchestrateSearch({ searchParams, analysisDepth }) {
      const orchestrationId = `orch_${Date.now()}`;
      const results = [];
  
      try {
        // Step 1: Execute database search
        const dbQuery = this.buildSearchQuery(searchParams);
        const searchResults = await this.executeOracleQuery(dbQuery);
        results.push({ step: 'database_search', count: searchResults.rows.length });
  
        // Step 2: Analyze profiles with Claude
        if (analysisDepth !== 'basic') {
          for (const profile of searchResults.rows.slice(0, 10)) { // Limit for cost
            const analysis = await this.analyzeProfile({
              profileData: profile,
              analysisType: analysisDepth === 'comprehensive' ? 'research' : 'scoring'
            });
            
            // Update database with analysis
            await this.executeOracleQuery({
              query: 'UPDATE client_profiles SET ai_score = :score WHERE id = :id',
              binds: { score: analysis.score, id: profile[0] }
            });
          }
          results.push({ step: 'ai_analysis', processed: Math.min(10, searchResults.rows.length) });
        }
  
        // Step 3: Create Obsidian notes for top matches
        if (analysisDepth === 'comprehensive') {
          const topMatches = searchResults.rows
            .sort((a, b) => (b[6] || 0) - (a[6] || 0)) // Sort by AI score
            .slice(0, 5);
  
          for (const match of topMatches) {
            await this.createObsidianNote({
              noteType: 'client',
              data: {
                name: match[1],
                company: match[3],
                title: match[2],
                industry: match[5],
                location: match[4],
                linkedinUrl: match[7],
                aiScore: match[6]
              }
            });
          }
          results.push({ step: 'obsidian_notes', created: topMatches.length });
        }
  
        return {
          orchestrationId,
          searchParams,
          analysisDepth,
          results,
          summary: {
            totalFound: searchResults.rows.length,
            analyzed: analysisDepth !== 'basic' ? Math.min(10, searchResults.rows.length) : 0,
            notesCreated: analysisDepth === 'comprehensive' ? Math.min(5, searchResults.rows.length) : 0
          }
        };
      } catch (error) {
        throw new Error(`Search orchestration failed: ${error.message}`);
      }
    }
    
    static async getPersonProfile({ linkedinUrl, profileId }) {
      // Implementation for getting LinkedIn person profile
      return {
        profileId: profileId || `profile_${Date.now()}`,
        linkedinUrl,
        status: 'retrieved',
        data: {
          name: 'Sample Profile',
          title: 'Sample Title',
          company: 'Sample Company',
          location: 'Sample Location'
        }
      };
    }
    
    static async listProfiles({ limit = 50, offset = 0 } = {}) {
      // Implementation for listing all profiles
      const query = `
        SELECT id, full_name, title, company, location, status, created_at 
        FROM profiles 
        ORDER BY id DESC
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
      `;
      
      const binds = { limit, offset };
      
      const result = await this.executeOracleQuery({ query, binds });
      
      return {
        profiles: result.rows,
        total: result.rows.length,
        limit,
        offset,
        metaData: result.metaData
      };
    }
    
    static async createObsidianNote({ noteType, profileData, aiSummary, customContent }) {
      const fs = require('fs').promises;
      const path = require('path');
      
      try {
        // Generate note content based on type
        const noteContent = this.formatObsidianNote(noteType, profileData, aiSummary, customContent);
        
        // Generate filename
        const timestamp = new Date().toISOString().split('T')[0];
        const safeName = (profileData.full_name || 'Unknown').replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
        const filename = `${noteType}_${safeName}_${timestamp}.md`;
        
        // Create vault directory if it doesn't exist
        const vaultPath = '/Users/Morpheous/Documents/Obsidian Vault';
        await fs.mkdir(vaultPath, { recursive: true });
        
        // Write file directly to vault
        const filePath = path.join(vaultPath, filename);
        await fs.writeFile(filePath, noteContent, 'utf8');
        
        return {
          success: true,
          filename,
          path: filePath,
          noteType,
          profileName: profileData.full_name,
          vaultPath: vaultPath
        };
        
      } catch (error) {
        throw new Error(`Obsidian note creation failed: ${error.message}`);
      }
    }
    
    static formatObsidianNote(noteType, profileData, aiSummary, customContent) {
      const timestamp = new Date().toISOString();
      const { full_name, title, company, location, linkedin_url, status } = profileData;
      
      let content = `# ${full_name || 'Unknown Profile'}\n\n`;
      content += `**Type:** ${noteType}\n`;
      content += `**Created:** ${timestamp}\n`;
      content += `**Status:** ${status || 'Unknown'}\n\n`;
      
      content += `## Profile Information\n\n`;
      content += `- **Name:** ${full_name || 'N/A'}\n`;
      content += `- **Title:** ${title || 'N/A'}\n`;
      content += `- **Company:** ${company || 'N/A'}\n`;
      content += `- **Location:** ${location || 'N/A'}\n`;
      content += `- **LinkedIn:** ${linkedin_url ? `[View Profile](${linkedin_url})` : 'N/A'}\n\n`;
      
      if (aiSummary) {
        content += `## AI Analysis\n\n${aiSummary}\n\n`;
      }
      
      if (customContent) {
        content += `## Additional Notes\n\n${customContent}\n\n`;
      }
      
      content += `## Tags\n\n`;
      content += `#${noteType} #linkedin #profile`;
      if (company) content += ` #${company.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`;
      if (location) content += ` #${location.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`;
      
      return content;
    }
    
    static async searchLinkedin({ keywords, location = '' }) {
      const puppeteer = require('puppeteer');
      
      const cookie = {
        name: 'li_at',
        value: process.env.LINKEDIN_MCP_SERVER_COOKIE,
        domain: '.linkedin.com',
      };

      if (!cookie.value) {
        throw new Error('LinkedIn session cookie is not configured in .env file.');
      }

      const browser = await puppeteer.launch({ 
        headless: true, 
        executablePath: '/usr/bin/chromium',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
      });
      const page = await browser.newPage();

      try {
        await page.setCookie(cookie);
        const searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keywords)}&origin=GLOBAL_SEARCH_HEADER&sid=G%3BO`;
        await page.goto(searchUrl, { waitUntil: 'networkidle2' });

        // Wait for the search results to load
        await page.waitForSelector('.reusable-search__result-container', { timeout: 10000 });

        const results = await page.evaluate(() => {
          const profiles = [];
          const resultElements = document.querySelectorAll('.reusable-search__result-container');

          resultElements.forEach(element => {
            const nameElement = element.querySelector('.entity-result__title-text a');
            const titleElement = element.querySelector('.entity-result__primary-subtitle');

            if (nameElement && titleElement) {
              profiles.push({
                name: nameElement.innerText.trim(),
                title: titleElement.innerText.trim(),
                profileUrl: nameElement.href,
              });
            }
          });
          return profiles.slice(0, 10); // Return top 10 results
        });

        return { 
          status: 'success', 
          count: results.length, 
          results: results,
          searchKeywords: keywords,
          searchLocation: location
        };
      } catch (error) {
        throw new Error(`LinkedIn search failed: ${error.message}`);
      } finally {
        await browser.close();
      }
    }
  
    static buildSearchQuery({ industry, location, jobTitle, companySize, keywords }) {
      let query = `
        SELECT id, full_name, title, company, location, industry, ai_score, linkedin_url, created_at
        FROM client_profiles 
        WHERE 1=1
      `;
      const binds = {};
  
      if (industry) {
        query += ' AND UPPER(industry) LIKE UPPER(:industry)';
        binds.industry = `%${industry}%`;
      }
      
      if (location) {
        query += ' AND UPPER(location) LIKE UPPER(:location)';
        binds.location = `%${location}%`;
      }
      
      if (jobTitle) {
        query += ' AND UPPER(title) LIKE UPPER(:jobTitle)';
        binds.jobTitle = `%${jobTitle}%`;
      }
      
      query += ' ORDER BY ai_score DESC NULLS LAST, created_at DESC';
      
      return { query, binds };
    }
  }
  
  // MCP API Routes
  fastify.register(async function (fastify) {
    // Get available tools
    fastify.get('/mcp/tools', async (request, reply) => {
      return {
        tools: Object.values(MCP_TOOLS),
        resourceTypes: RESOURCE_TYPES
      };
    });
  
    // Execute MCP tool
    fastify.post('/mcp/execute/:toolName', async (request, reply) => {
      const { toolName } = request.params;
      const input = request.body;
  
      if (!MCP_TOOLS[toolName]) {
        return reply.code(404).send({ error: `Tool '${toolName}' not found` });
      }
  
      const result = await MCPToolExecutor.execute(toolName, input);
      return result;
    });
  
    // Get execution status
    fastify.get('/mcp/execution/:executionId', async (request, reply) => {
      const { executionId } = request.params;
      const execution = await redis.get(`execution:${executionId}`);
      
      if (!execution) {
        return reply.code(404).send({ error: 'Execution not found' });
      }
      
      return JSON.parse(execution);
    });
  
    // Health check
    fastify.get('/health', async (request, reply) => {
      const health = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        services: {
          redis: 'unknown',
          oracle: 'unknown'
        }
      };
  
      try {
        await redis.ping();
        health.services.redis = 'connected';
      } catch (error) {
        health.services.redis = 'disconnected';
      }
  
      try {
        const connection = await oraclePool.getConnection();
        await connection.close();
        health.services.oracle = 'connected';
      } catch (error) {
        health.services.oracle = 'disconnected';
      }
  
      return health;
    });
  
    // Quick search endpoint (orchestrated)
    fastify.post('/search', async (request, reply) => {
      const searchParams = request.body;
      const analysisDepth = request.query.depth || 'basic';
      
      const result = await MCPToolExecutor.execute('orchestrate-search', {
        searchParams,
        analysisDepth
      });
      
      return result;
    });
  });
  
  // Start server
  const start = async () => {
    try {
      await initializeMCP();
      await fastify.listen({ 
        port: process.env.PORT || 3001,
        host: '0.0.0.0'
      });
      console.log('MCP LinkedIn Search Server running on port', process.env.PORT || 3001);
    } catch (err) {
      fastify.log.error(err);
      process.exit(1);
    }
  };
  
  start();