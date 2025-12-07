// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	// For embedding in Tauri webview
	base: '/',
	outDir: './dist',
	build: {
		format: 'directory',
	},
	integrations: [
		starlight({
			title: 'Hands',
			logo: {
				src: './src/assets/logo.svg',
			},
			customCss: [
				'./src/styles/theme.css',
			],
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/hands-app/hands' },
				{ icon: 'discord', label: 'Discord', href: 'https://discord.gg/hands' },
			],
			sidebar: [
				{
					label: 'Getting Started',
					items: [
						{ label: 'Introduction', slug: 'introduction' },
						{ label: 'Quickstart', slug: 'quickstart' },
						{ label: 'Workbooks', slug: 'workbooks' },
					],
				},
				{
					label: 'Working with Data',
					items: [
						{ label: 'Importing Data', slug: 'data/importing' },
						{ label: 'Querying Data', slug: 'data/querying' },
						{ label: 'Transforming Data', slug: 'data/transforming' },
					],
				},
				{
					label: 'Building Apps',
					items: [
						{ label: 'Overview', slug: 'apps/overview' },
						{ label: 'Dashboards', slug: 'apps/dashboards' },
						{ label: 'Charts', slug: 'apps/charts' },
						{ label: 'API Routes', slug: 'apps/api-routes' },
						{ label: 'Scheduled Jobs', slug: 'apps/scheduled-jobs' },
					],
				},
				{
					label: 'AI Features',
					items: [
						{ label: 'Chat', slug: 'ai/chat' },
						{ label: 'Agents', slug: 'ai/agents' },
						{ label: 'Tools', slug: 'ai/tools' },
					],
				},
				{
					label: 'Deployment',
					items: [
						{ label: 'Deploy to Cloudflare', slug: 'deploy/cloudflare' },
						{ label: 'Configuration', slug: 'deploy/configuration' },
					],
				},
				{
					label: 'Guides',
					items: [
						{ label: 'First Dashboard', slug: 'guides/first-dashboard' },
						{ label: 'Data Pipeline', slug: 'guides/data-pipeline' },
						{ label: 'API Backend', slug: 'guides/api-backend' },
					],
				},
				{
					label: 'Stdlib Reference',
					items: [
						{ label: 'Overview', slug: 'stdlib/overview' },
						{ label: 'SQL Client', slug: 'stdlib/sql' },
						{ label: 'Monitor', slug: 'stdlib/monitor' },
						{ label: 'Dashboard', slug: 'stdlib/dashboard' },
						{ label: 'Integration', slug: 'stdlib/integration' },
						{ label: 'Configuration', slug: 'stdlib/config' },
						{ label: 'Wrangler', slug: 'stdlib/wrangler' },
					],
				},
			],
			// Disable features not needed for embedded docs
			editLink: {
				baseUrl: 'https://github.com/hands-app/hands/edit/main/docs/',
			},
			tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },
			lastUpdated: false,
			pagination: true,
		}),
	],
});
