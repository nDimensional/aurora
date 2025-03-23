import React, { useEffect, useMemo, useState } from "react";

import repostIconURL from "../icons/repost.svg?url";
import replyIconURL from "../icons/reply.svg?url";
import likeIconURL from "../icons/like.svg?url";
import openIconURL from "../icons/open.svg?url";

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

export const Feed: React.FC<{}> = ({}) => {
	const [cursor, setCursor] = useState<string | null>(null);
	const [feed, setFeed] = useState<{ post: Post }[]>([]);
	useEffect(() => {
		fetch("/feed.json")
			.then((res) => res.json() as Promise<{ cursor: string; feed: { post: Post }[] }>)
			.then(({ cursor, feed }) => {
				setCursor(cursor);
				setFeed(feed);
			});
	}, []);
	console.log(feed);

	return (
		<div id="feed">
			{feed.map(({ post }, i) => (
				<Post key={i} post={post} />
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
					<img src={openIconURL} width="24" height="24" />
				</a>
			</div>

			<div className="post-text">{post.record.text}</div>

			<div className="engagement">
				<span>
					<img src={replyIconURL} width="18" height="18" /> {post.replyCount}
				</span>
				<span>
					<img src={repostIconURL} width="18" height="18" /> {post.repostCount + post.quoteCount}
				</span>
				<span>
					<img src={likeIconURL} width="18" height="18" /> {post.likeCount}
				</span>
			</div>
		</div>
	);
};
