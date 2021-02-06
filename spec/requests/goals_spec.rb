require 'rails_helper'

RSpec.describe "/goals", type: :request do

  let(:valid_attributes) {
    {goals_data: {goals: {'goal-1': {'id': 'goal-1', 'content': 'test', 'description':'test'}}, columns:{'column-1': { 'id': 'column-1', 'title': 'column-1', 'goalIds':['goal-1']  }}, 'columnOrder':['column-1']}, user_sub: 'user'}
  }

  let(:invalid_attributes) {
    {goals_data: {}, user_sub: nil}
  }

  let(:valid_headers){
    {
      Authorization: Rails.application.credentials.auth0[:api_authorization]
    }
  }

  describe "GET /index" do
    it "renders a successful response" do
      test = Goal.create! valid_attributes
      get goals_url, headers: valid_headers, as: :json
      expect(response).to be_successful
    end
  end

  describe "GET /show" do
    it "renders a successful response" do
      goal = Goal.create! valid_attributes
      get goal_url(goal.attributes['id']), headers: valid_headers, as: :json
      expect(response).to be_successful
    end
  end

  describe "POST /create" do
    context "with valid parameters" do
      it "creates a new Goal" do
        expect {
          post goals_url,
               params: valid_attributes, headers: valid_headers, as: :json
        }.to change(Goal, :count).by(1)
      end

      it "renders a JSON response with the new goal" do
        post goals_url,
             params: valid_attributes, headers: valid_headers, as: :json
        expect(response).to have_http_status(:created)
        expect(response.content_type).to match(a_string_including("application/json"))
      end
    end

    context "with invalid parameters" do
      it "does not create a new Goal" do
        expect {
          post goals_url,
               params: invalid_attributes, as: :json
        }.to change(Goal, :count).by(0)
      end

      it "renders a JSON response with errors for the new goal" do
        post goals_url,
             params: invalid_attributes, headers: valid_headers, as: :json
        expect(response).to have_http_status(:unprocessable_entity)
        expect(response.content_type).to eq("application/json; charset=utf-8")
      end
    end
  end

  describe "PATCH /update" do
    context "with valid parameters" do

      it "updates the requested goal" do
        goal = Goal.create! valid_attributes
        new_attributes = {goals_data: {goals: {'goal-1': {'id': 'goal-1', 'content': 'update', 'description':'update'}}, columns:{'column-1': { 'id': 'column-1', 'title': 'column-1', 'goalIds':['goal-1']  }}, 'columnOrder':['column-1']}, user_sub: "user"}
        put goal_url(goal),
          params: new_attributes, headers: valid_headers, as: :json
        goal.reload
        expect(goal.attributes['goals_data']['goals']['goal-1']['content']).to eq('update')
        expect(goal.attributes['goals_data']['goals']['goal-1']['description']).to eq('update')
      end

      it "renders a JSON response with the goal" do
        goal = Goal.create! valid_attributes
        new_attributes = {goals_data: {goals: {'goal-1': {'id': 'goal-1', 'content': 'update', 'description':'update'}}, columns:{'column-1': { 'id': 'column-1', 'title': 'column-1', 'goalIds':['goal-1']  }}, 'columnOrder':['column-1']}, user_sub: "user"}
        patch goal_url(goal),
          params: new_attributes, headers: valid_headers, as: :json
        expect(response).to have_http_status(:ok)
        expect(response.content_type).to match(a_string_including("application/json"))
      end
    end
  end

  describe "DELETE /destroy" do
    it "destroys the requested goal" do
      goal = Goal.create! valid_attributes
      expect {
        delete goal_url(goal), headers: valid_headers, as: :json
      }.to change(Goal, :count).by(-1)
    end
  end
end

