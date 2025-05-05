import React, { useEffect, useMemo, useState } from "react";

import openIconURL from "../icons/open.svg?url";

import { CacheMap } from "./utils.js";

type Author = {
	associated: { chat?: { allowIncoming?: string } };
	avatar: string;
	createdAt: string;
	did: string;
	displayName: string;
	handle: string;
	labels: Label[];
};

type Label = never;

type PostRecord = {
	$type: "app.bsky.feed.post";
	createdAt: string;
	embed: {};
	langs: string[];
	text: string;
};

type Post = {
	author: Author;
	cid: string;
	indexedAt: string;
	labels: Label[];
	likeCount: number;
	quoteCount: number;
	record: PostRecord;
	replyCount: number;
	repostCount: number;
	uri: string;
};

export interface FeedProps {
	uris: string[];
}

export const Feed: React.FC<FeedProps> = (props) => {
	const [posts, setPosts] = useState<Post[]>([]);

	const cache = useMemo(() => new CacheMap<string, Post>(256), []);

	useEffect(() => {
		if (props.uris.length === 0) {
			return setPosts([]);
		}

		const cachedPosts = props.uris.map((uri) => cache.get(uri));

		const indices: number[] = [];
		const queryParams: string[] = [];
		for (const [i, uri] of props.uris.entries()) {
			if (cachedPosts[i] === undefined) {
				indices.push(i);
				queryParams.push("uris=" + uri);
			}
		}

		console.log("missing %d posts from cache", indices.length);

		if (indices.length === 0) {
			setPosts(cachedPosts as Post[]);
			return;
		}

		const query = queryParams.join("&");

		fetch(`https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts?${query}`)
			.then((res) => res.json())
			.then(({ posts }: { posts: Post[] }) => {
				console.log(posts);
				for (const post of posts) {
					const index = props.uris.indexOf(post.uri);
					if (index === -1) {
						console.error("unexpected post uri", post);
						continue;
					}

					cachedPosts[index] = post;
					cache.set(post.uri, post);
				}

				setPosts(cachedPosts.filter((post) => post !== undefined));
			});

		// fetch("/feed2.json")
		// 	.then((res) => res.json())
		// 	.then(({ posts }: { posts: Post[] }) => setPosts(posts));
	}, [props.uris]);

	return (
		<div id="feed">
			{posts.map((post) => (
				<Post key={post.uri} post={post} />
			))}
		</div>
	);
};

const Post: React.FC<{ post: Post }> = ({ post }) => {
	// const [formattedDate, formattedTime] = useMemo(() => {
	// 	const date = new Date(post.indexedAt);
	// 	return [date.toLocaleDateString(), date.toLocaleTimeString()];
	// }, []);

	const postURL = useMemo(() => {
		const recordKey = post.uri.slice(post.uri.lastIndexOf("/") + 1);
		return `https://bsky.app/profile/${post.author.did}/post/${recordKey}`;
	}, []);

	const profileURL = useMemo(() => `https://bsky.app/profile/${post.author.did}`, []);

	return (
		<div className="post">
			<div className="post-header">
				<a href={profileURL} target="_blank" rel="noopener noreferrer">
					<img className="avatar" src={post.author.avatar} alt={post.author.displayName} />
					<div>
						<div className="display-name">{post.author.displayName}</div>
						<div className="handle">@{post.author.handle}</div>
					</div>
				</a>
				<a href={postURL} target="_blank" rel="noopener noreferrer">
					<img src={openIconURL} width="22" height="22" />
				</a>
			</div>

			<div className="post-text">{post.record.text}</div>
		</div>
	);
};
