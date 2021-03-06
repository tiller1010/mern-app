import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faHome, faPlay, faUser } from '@fortawesome/free-solid-svg-icons';

class Navigation extends React.Component {

	render(){
		return (
			<nav>
				<div className="flex">
					<div className="small-pad">
						<a href={`/`} className="button">
							<span>Home</span>
					        <FontAwesomeIcon icon={faHome}/>
						</a>
					</div>
				    <div className="small-pad">
						<a href={`/videos`} className="button">
							<span>Videos</span>
					        <FontAwesomeIcon icon={faPlay}/>
						</a>
					</div>
				    <div className="small-pad">
					    <a href="/videos/add" className="button">
						    <span>Add a video</span>
					        <FontAwesomeIcon icon={faPlus}/>
					    </a>
				    </div>
				    <div className="small-pad">
					    <a href="/account-profile" className="button">
						    <span>Account Profile</span>
					        <FontAwesomeIcon icon={faUser}/>
					    </a>
				    </div>
				</div>
			</nav>
		);
	}
}

export default Navigation;