document.addEventListener('DOMContentLoaded', function() {
    const tweetText = document.getElementById('tweet-text');
    tweetText.addEventListener('input', updateCharCounter);
    loadDrafts();
    document.getElementById('tweet-text').addEventListener('input', updatePreview);
});

function switchTab(tabName) {
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabs.forEach(tab => tab.classList.remove('active'));
    tabContents.forEach(content => content.classList.remove('active'));
    
    event.target.classList.add('active');
    document.getElementById(`${tabName}-tab`).classList.add('active');
    
    if (tabName === 'preview') updatePreview();
    if (tabName === 'drafts') loadDrafts();
}

function updateCharCounter() {
    const tweetText = document.getElementById('tweet-text');
    const charCounter = document.getElementById('char-counter');
    const length = tweetText.value.length;
    
    charCounter.textContent = `${length}/280`;
    charCounter.classList.remove('warning', 'danger');
    if (length > 260) charCounter.classList.add('danger');
    else if (length > 240) charCounter.classList.add('warning');
}

function updatePreview() {
    const tweetText = document.getElementById('tweet-text').value;
    const previewContent = document.getElementById('preview-content');
    const previewMedia = document.getElementById('preview-media');
    const previewMediaImage = document.getElementById('preview-media-image');
    
    previewContent.textContent = tweetText.trim() === '' ? 'Your tweet will appear here...' : tweetText;
    
    const fileInput = document.getElementById('file-input');
    if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const reader = new FileReader();
        
        reader.onload = function(e) {
            previewMediaImage.src = e.target.result;
            previewMedia.style.display = 'block';
        };
        
        reader.readAsDataURL(file);
    } else {
        previewMedia.style.display = 'none';
    }
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (file.size > 5 * 1024 * 1024) {
        showToast('File size exceeds 5MB limit');
        return;
    }
    
    if (!file.type.match('image.*') && !file.type.match('video.*')) {
        showToast('Please select an image or video file');
        return;
    }
    
    const filePreviewContainer = document.getElementById('file-preview-container');
    const previewImage = document.getElementById('preview-image');
    const fileName = document.getElementById('file-name');
    const fileSize = document.getElementById('file-size');
    
    const reader = new FileReader();
    
    reader.onload = function(e) {
        previewImage.src = e.target.result;
        fileName.textContent = file.name;
        fileSize.textContent = formatFileSize(file.size);
        filePreviewContainer.style.display = 'block';
        
        const previewMedia = document.getElementById('preview-media');
        const previewMediaImage = document.getElementById('preview-media-image');
        previewMediaImage.src = e.target.result;
        previewMedia.style.display = 'block';
    };
    
    reader.readAsDataURL(file);
    showToast('File uploaded successfully');
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function removeFile() {
    document.getElementById('file-input').value = '';
    document.getElementById('file-preview-container').style.display = 'none';
    document.getElementById('preview-media').style.display = 'none';
    showToast('File removed');
}

function saveDraft() {
    const tweetText = document.getElementById('tweet-text').value;
    if (tweetText.trim() === '') {
        showToast('Cannot save empty tweet');
        return;
    }
    
    const fileInput = document.getElementById('file-input');
    let fileData = null;
    
    if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        fileData = {
            name: file.name,
            size: file.size,
            type: file.type,
            data: document.getElementById('preview-image').src
        };
    }
    
    const drafts = JSON.parse(localStorage.getItem('tweetDrafts') || '[]');
    const newDraft = {
        id: Date.now(),
        content: tweetText,
        file: fileData,
        date: new Date().toISOString()
    };
    
    drafts.unshift(newDraft);
    localStorage.setItem('tweetDrafts', JSON.stringify(drafts));
    showToast('Draft saved successfully');
}

function loadDrafts() {
    const drafts = JSON.parse(localStorage.getItem('tweetDrafts') || '[]');
    const draftsList = document.getElementById('drafts-list');
    
    draftsList.innerHTML = '';
    
    if (drafts.length === 0) {
        draftsList.innerHTML = '<p style="text-align: center; color: #5f6368;">No drafts saved yet</p>';
        return;
    }
    
    drafts.forEach(draft => {
        const draftItem = document.createElement('div');
        draftItem.className = 'draft-item';
        draftItem.dataset.draftId = draft.id;
        
        const date = new Date(draft.date);
        const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
        
        let previewContent = draft.content;
        if (draft.file) {
            previewContent += ` [${draft.file.type.startsWith('image') ? 'Image' : 'Video'}: ${draft.file.name}]`;
        }
        
        draftItem.innerHTML = `
            <div class="draft-date">${formattedDate}</div>
            <div class="draft-preview">${previewContent}</div>
            <i class="fas fa-trash draft-delete" data-draft-id="${draft.id}"></i>
        `;
        
        draftItem.addEventListener('click', function(e) {
            if (!e.target.classList.contains('draft-delete')) {
                loadDraft(draft);
            }
        });
        
        draftsList.appendChild(draftItem);
    });
    
    document.querySelectorAll('.draft-delete').forEach(button => {
        button.addEventListener('click', function(e) {
            e.stopPropagation();
            const draftId = parseInt(this.dataset.draftId);
            deleteDraft(draftId);
        });
    });
}

function loadDraft(draft) {
    document.getElementById('tweet-text').value = draft.content;
    updateCharCounter();
    
    if (draft.file) {
        const filePreviewContainer = document.getElementById('file-preview-container');
        const previewImage = document.getElementById('preview-image');
        const fileName = document.getElementById('file-name');
        const fileSize = document.getElementById('file-size');
        
        previewImage.src = draft.file.data;
        fileName.textContent = draft.file.name;
        fileSize.textContent = formatFileSize(draft.file.size);
        filePreviewContainer.style.display = 'block';
        
        const previewMedia = document.getElementById('preview-media');
        const previewMediaImage = document.getElementById('preview-media-image');
        previewMediaImage.src = draft.file.data;
        previewMedia.style.display = 'block';
    } else {
        document.getElementById('file-preview-container').style.display = 'none';
        document.getElementById('preview-media').style.display = 'none';
    }
    
    switchTab('compose');
    showToast('Draft loaded');
}

function deleteDraft(draftId) {
    if (confirm('Are you sure you want to delete this draft?')) {
        const drafts = JSON.parse(localStorage.getItem('tweetDrafts') || '[]');
        const updatedDrafts = drafts.filter(draft => draft.id !== draftId);
        localStorage.setItem('tweetDrafts', JSON.stringify(updatedDrafts));
        
        loadDrafts();
        showToast('Draft deleted successfully');
    }
}

function clearAllDrafts() {
    if (confirm('Are you sure you want to delete all drafts?')) {
        localStorage.removeItem('tweetDrafts');
        loadDrafts();
        showToast('All drafts cleared');
    }
}

function exportTweet() {
    const tweetText = document.getElementById('tweet-text').value;
    if (tweetText.trim() === '') {
        showToast('Cannot export empty tweet');
        return;
    }
    
    let exportContent = tweetText;
    
    const fileInput = document.getElementById('file-input');
    if (fileInput.files.length > 0) {
        exportContent += `\n\n[Attached file: ${fileInput.files[0].name}]`;
    }
    
    const blob = new Blob([exportContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tweet_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('Tweet exported successfully');
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.style.display = 'block';
    
    setTimeout(() => {
        toast.style.display = 'none';
    }, 3000);
}
