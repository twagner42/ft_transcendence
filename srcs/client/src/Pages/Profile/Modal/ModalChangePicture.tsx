import React from "react";
import ReactDOM from "react-dom";
import {useState} from 'react'
import {patchFetchPicture} from "../Fetch/patchFetchPicture"
import "./ModalChangeContent.css"
import "../../../Components/Tools/Text.css"
import "../../../Components/Tools/Box.css"
import { postFetchPicture } from "../Fetch/postFetchPicture";

export default function ModalChangePicture({ isShowing, hide, id, up, title } : any) {

	const [content, setcontent] = useState('');
	const [url, setUrl] = useState('');

	function handleChange(event : any) {
		setcontent(event.target.value);
		setUrl(`http://127.0.0.1:4200/users/${id}/picture`);
	};

	function postAndClose(e : any)
	{
		e.preventDefault();
    const files = e.target.files
    const formData = new FormData()
    formData.append('picture', files[0])

		const test = postFetchPicture({url: url, formData: formData});
		test.then((responseObject)=> {
			if (responseObject.status >= 400)
			{ alert("Bad request"); }
		})
		hide();
		up();
	}

	return (
		isShowing
		? ReactDOM.createPortal(
			<>
			  <div className="modal-overlay">
				<div className="modal-wrapper">
				  <div className="modal2">
					<div className="modal-header">
					<div className="yellowText" style={{fontSize: "1.22em"}}> {title}</div>
					  <button
						type="button"
						className="modal-close-button"
						onClick={hide}
					  >
						<span>&times;</span>
					  </button>
					</div>
					<form onSubmit={postAndClose}>
            <input id='picture' name='picture' type="file" value={content}
							onChange={handleChange}
							className="inputContent"/>
						<input type="submit" value="Ok" className="inputSubmit"/>
					</form>
					</div>
				</div>
			  </div>
			</>,
			document.body
		  )
		: null);
}
