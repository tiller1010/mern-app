import React from 'react';
import DefaultLayout from './layouts/default';

const Topic = (props) => {
  return (
	<DefaultLayout pathResolver="../../../">
		<div className="pad">
			<h1>Level {props.levelID}</h1>
		</div>
		<div id="topic" data-levelID={props.levelID} data-topicID={props.topicID} data-completed={props.completed}></div>
	</DefaultLayout>
  );
}

export default Topic;
